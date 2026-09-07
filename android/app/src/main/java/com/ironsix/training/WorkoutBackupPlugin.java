package com.ironsix.training;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "WorkoutBackup")
public class WorkoutBackupPlugin extends Plugin {
    private static final String PENDING_BACKUP = "iron-six-pending-backup.json";

    @PluginMethod public void save(PluginCall call) {
        String json = call.getString("json");
        if (json == null || json.length() > 10000000) {
            call.reject("Backup is missing or too large to export.");
            return;
        }
        try (FileOutputStream pending = getContext().openFileOutput(PENDING_BACKUP, Activity.MODE_PRIVATE)) {
            pending.write(json.getBytes(StandardCharsets.UTF_8));
            pending.flush();
        } catch (Exception error) {
            call.reject("Could not stage the backup. Your local workout remains saved.");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, "iron-six-workout-backup.json");
        startActivityForResult(call, intent, "saveResult");
    }

    @ActivityCallback private void saveResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject response = new JSObject();
        if (result.getResultCode() != Activity.RESULT_OK) {
            response.put("cancelled", true);
            call.resolve(response);
            return;
        }
        if (result.getData() == null || result.getData().getData() == null) {
            call.reject("No backup destination selected.");
            return;
        }
        File staged = new File(getContext().getFilesDir(), PENDING_BACKUP);
        if (!staged.isFile() || staged.length() == 0) {
            call.reject("The staged backup was unavailable. Your local workout remains saved.");
            return;
        }
        try (FileInputStream in = new FileInputStream(staged);
             OutputStream out = getContext().getContentResolver().openOutputStream(result.getData().getData(), "wt")) {
            if (out == null) throw new IllegalStateException();
            byte[] buffer = new byte[8192];
            int read;
            long total = 0;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
                total += read;
            }
            out.flush();
            if (total == 0) throw new IllegalStateException();
            staged.delete();
            response.put("saved", true);
            response.put("bytes", total);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Could not write the backup. Your local workout remains saved.");
        }
    }
}
