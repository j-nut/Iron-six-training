package com.ironsix.training;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.view.WindowManager;
import android.view.View;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WorkoutBackupPlugin.class);
        registerPlugin(VoiceCommandPlugin.class);
        registerPlugin(AppUpdatePlugin.class);
        super.onCreate(savedInstanceState);
        // Android 15+ draws the WebView beneath system bars. CSS env(safe-area-
        // inset-top) is often zero in Android WebView; export native insets in
        // CSS pixels so the sticky exercise toolbar cannot overlap the clock,
        // camera hole or the system gesture-navigation area.
        final View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (view, windowInsets) -> {
            final Insets status = windowInsets.getInsets(
                WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.displayCutout());
            final Insets navigation = windowInsets.getInsets(
                WindowInsetsCompat.Type.navigationBars());
            final float density = getResources().getDisplayMetrics().density;
            final int top = Math.max(0, Math.round(status.top / density));
            final int bottom = Math.max(0, Math.round(navigation.bottom / density));
            final WebView web = getBridge() == null ? null : getBridge().getWebView();
            if (web != null) web.post(() -> web.evaluateJavascript(
                "(function(){if(!document.documentElement)return;" +
                "document.documentElement.style.setProperty('--safe-area-inset-top','" + top + "px');" +
                "document.documentElement.style.setProperty('--safe-area-inset-bottom','" + bottom + "px');" +
                "})()", null));
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(decor);
    }
    @Override public void onResume() {
        super.onResume();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        ViewCompat.requestApplyInsets(getWindow().getDecorView());
    }
    @Override public void onPause() {
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        super.onPause();
    }
}
