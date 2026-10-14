package com.ironsix.training;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * In-app updates for sideloaded builds.
 *
 * download() fetches a signed release APK from this repository's GitHub Releases only, streams it
 * into the app-private cache and checks its SHA-256 against SHA256SUMS.txt from the same release.
 * install() hands the verified file to Android's package installer through the non-exported
 * FileProvider. Android itself refuses to install an update signed with a different key than the
 * installed app, so even a file that somehow passed the checks here could not replace Iron Six
 * unless it carries our release signature. We rely on that platform guarantee rather than
 * re-implementing signature checks.
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {
    private static final String DOWNLOAD_PREFIX = "https://github.com/j-nut/Iron-six-training/releases/download/android-build-";
    private static final String UPDATES_DIR = "updates";
    private static final long MAX_BYTES = 300L * 1024L * 1024L;
    private static final int MAX_REDIRECTS = 5;

    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean downloading = new AtomicBoolean(false);

    private static boolean validBuild(Integer build) {
        return build != null && build > 0 && build < 1000000000;
    }

    private static boolean validSha(String sha) {
        return sha != null && sha.matches("^[a-fA-F0-9]{64}$");
    }

    private static boolean allowedHost(String host) {
        if (host == null) return false;
        String h = host.toLowerCase(Locale.ROOT);
        return h.equals("github.com") || h.endsWith(".githubusercontent.com");
    }

    private File updatesDir() {
        File dir = new File(getContext().getCacheDir(), UPDATES_DIR);
        if (!dir.isDirectory()) dir.mkdirs();
        return dir;
    }

    private File apkFile(int build) {
        return new File(updatesDir(), "iron-six-" + build + ".apk");
    }

    private void cleanOld(File keep) {
        File[] files = updatesDir().listFiles();
        if (files == null) return;
        for (File file : files) {
            if (keep == null || !file.getName().equals(keep.getName())) file.delete();
        }
    }

    private static String hex(byte[] bytes) {
        StringBuilder out = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) out.append(String.format(Locale.ROOT, "%02x", b));
        return out.toString();
    }

    private static String sha256Of(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (FileInputStream in = new FileInputStream(file)) {
            byte[] buffer = new byte[65536];
            int read;
            while ((read = in.read(buffer)) != -1) digest.update(buffer, 0, read);
        }
        return hex(digest.digest());
    }

    private HttpURLConnection open(String start) throws Exception {
        String current = start;
        for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
            URL url = new URL(current);
            if (!"https".equals(url.getProtocol()) || !allowedHost(url.getHost())) throw new SecurityException("blocked host");
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            connection.setRequestProperty("User-Agent", "IronSix-Android-Updater");
            int code = connection.getResponseCode();
            if (code >= 300 && code < 400) {
                String location = connection.getHeaderField("Location");
                connection.disconnect();
                if (location == null) throw new IllegalStateException("redirect without location");
                current = new URL(url, location).toString();
                continue;
            }
            if (code != HttpURLConnection.HTTP_OK) {
                connection.disconnect();
                throw new IllegalStateException("http " + code);
            }
            return connection;
        }
        throw new IllegalStateException("too many redirects");
    }

    @PluginMethod
    public void download(PluginCall call) {
        final String url = call.getString("url");
        final String sha = call.getString("sha256");
        final Integer build = call.getInt("build");
        if (!validBuild(build) || !validSha(sha) || url == null
            || !url.equals(DOWNLOAD_PREFIX + build + "/iron-six.apk")) {
            call.reject("This update link is not an Iron Six release.", "INVALID");
            return;
        }
        if (!downloading.compareAndSet(false, true)) {
            call.reject("An update is already downloading.", "BUSY");
            return;
        }
        final String expected = sha.toLowerCase(Locale.ROOT);
        worker.execute(() -> {
            final File target = apkFile(build);
            final File partial = new File(updatesDir(), "iron-six-" + build + ".apk.part");
            HttpURLConnection connection = null;
            try {
                if (target.isFile() && expected.equals(sha256Of(target))) {
                    cleanOld(target);
                    JSObject done = new JSObject();
                    done.put("build", build);
                    done.put("bytes", target.length());
                    done.put("cached", true);
                    call.resolve(done);
                    return;
                }
                cleanOld(null);
                connection = open(url);
                long total = connection.getContentLengthLong();
                if (total > MAX_BYTES) throw new IllegalStateException("too large");
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                long received = 0;
                long lastNotify = 0;
                try (InputStream in = connection.getInputStream();
                     FileOutputStream out = new FileOutputStream(partial)) {
                    byte[] buffer = new byte[65536];
                    int read;
                    while ((read = in.read(buffer)) != -1) {
                        received += read;
                        if (received > MAX_BYTES) throw new IllegalStateException("too large");
                        digest.update(buffer, 0, read);
                        out.write(buffer, 0, read);
                        long now = System.currentTimeMillis();
                        if (now - lastNotify > 250) {
                            lastNotify = now;
                            JSObject progress = new JSObject();
                            progress.put("build", build);
                            progress.put("received", received);
                            progress.put("total", total);
                            notifyListeners("downloadProgress", progress);
                        }
                    }
                    out.flush();
                    out.getFD().sync();
                }
                if (total > 0 && received != total) throw new IllegalStateException("incomplete");
                String actual = hex(digest.digest());
                if (!expected.equals(actual)) {
                    partial.delete();
                    call.reject("The downloaded update did not match its published checksum and was deleted.", "CHECKSUM");
                    return;
                }
                if (target.exists()) target.delete();
                if (!partial.renameTo(target)) throw new IllegalStateException("rename failed");
                JSObject finalProgress = new JSObject();
                finalProgress.put("build", build);
                finalProgress.put("received", received);
                finalProgress.put("total", received);
                notifyListeners("downloadProgress", finalProgress);
                JSObject done = new JSObject();
                done.put("build", build);
                done.put("bytes", received);
                call.resolve(done);
            } catch (SecurityException error) {
                partial.delete();
                call.reject("The update was redirected somewhere unexpected and was stopped.", "INVALID");
            } catch (Exception error) {
                partial.delete();
                call.reject("The update could not be downloaded. Check your connection and try again.", "NETWORK");
            } finally {
                if (connection != null) connection.disconnect();
                downloading.set(false);
            }
        });
    }

    @PluginMethod
    public void install(PluginCall call) {
        final Integer build = call.getInt("build");
        if (!validBuild(build)) {
            call.reject("Unknown update build.", "INVALID");
            return;
        }
        final File file = apkFile(build);
        if (!file.isFile() || file.length() == 0) {
            call.reject("The update has not been downloaded yet.", "MISSING");
            return;
        }
        final String sha = call.getString("sha256");
        if (sha != null) {
            try {
                if (!validSha(sha) || !sha.toLowerCase(Locale.ROOT).equals(sha256Of(file))) {
                    file.delete();
                    call.reject("The downloaded update did not match its published checksum and was deleted.", "CHECKSUM");
                    return;
                }
            } catch (Exception error) {
                call.reject("The update file could not be read.", "MISSING");
                return;
            }
        }
        Context context = getContext();
        // Android 8+ asks the user once to allow installs from this app ("Install unknown apps").
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && !context.getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + context.getPackageName()));
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                context.startActivity(settings);
            } catch (Exception ignored) {
                // Some ROMs lack the per-app screen; the JS explains where to find the setting.
            }
            JSObject result = new JSObject();
            result.put("needsPermission", true);
            call.resolve(result);
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", file);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            JSObject result = new JSObject();
            result.put("launched", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Android's installer could not be opened.", "INSTALLER");
        }
    }

    @Override
    protected void handleOnDestroy() {
        worker.shutdownNow();
        super.handleOnDestroy();
    }
}
