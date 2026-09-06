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
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "WorkoutBackup")
public class WorkoutBackupPlugin extends Plugin {
    @PluginMethod public void save(PluginCall call) {
        String json = call.getString("json");
        if (json == null || json.length() > 10000000) {
            call.reject("Backup is missing or too large to export.");
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
        try (OutputStream out = getContext().getContentResolver().openOutputStream(result.getData().getData())) {
            if (out == null) throw new IllegalStateException();
            out.write(call.getString("json", "{}").getBytes(StandardCharsets.UTF_8));
            response.put("saved", true);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Could not write the backup. Your local workout remains saved.");
        }
    }
}
