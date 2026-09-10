package com.ironsix.training;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.Locale;

@CapacitorPlugin(
    name = "VoiceCommand",
    permissions = { @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }) }
)
public class VoiceCommandPlugin extends Plugin {
    private SpeechRecognizer recognizer;
    private PluginCall activeCall;
    private boolean usingOnDevice;
    private boolean finishing;

    @PluginMethod
    public void listen(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermissionCallback");
            return;
        }
        startListening(call);
    }

    @PermissionCallback
    private void microphonePermissionCallback(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("Microphone permission was denied.");
            return;
        }
        startListening(call);
    }

    private void startListening(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            cancelActive("replaced");
            if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
                call.reject("Speech recognition is unavailable on this device.");
                return;
            }
            try {
                usingOnDevice = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                    && SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext());
                recognizer = usingOnDevice
                    ? SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext())
                    : SpeechRecognizer.createSpeechRecognizer(getContext());
                activeCall = call;
                finishing = false;
                recognizer.setRecognitionListener(new RecognitionListener() {
                    @Override public void onReadyForSpeech(Bundle params) {}
                    @Override public void onBeginningOfSpeech() {}
                    @Override public void onRmsChanged(float rmsdB) {}
                    @Override public void onBufferReceived(byte[] buffer) {}
                    @Override public void onEndOfSpeech() {}
                    @Override public void onEvent(int eventType, Bundle params) {}
                    @Override public void onPartialResults(Bundle partialResults) {}

                    @Override public void onError(int error) {
                        if (finishing) return;
                        if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                            finishSuccess("", "no-speech", null);
                            return;
                        }
                        if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) {
                            finishSuccess("", "busy", null);
                            return;
                        }
                        finishError(messageFor(error));
                    }

                    @Override public void onResults(Bundle results) {
                        ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        String text = matches == null || matches.isEmpty() ? "" : matches.get(0).trim();
                        Float confidence = null;
                        float[] scores = results.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES);
                        if (scores != null && scores.length > 0 && scores[0] >= 0f) confidence = scores[0];
                        finishSuccess(text, null, confidence);
                    }
                });
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, call.getString("language", Locale.US.toLanguageTag()));
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
                intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, usingOnDevice);
                recognizer.startListening(intent);
            } catch (Exception error) {
                destroyRecognizer();
                activeCall = null;
                call.reject("Could not start speech recognition: " + safeMessage(error));
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            cancelActive("aborted");
            call.resolve();
        });
    }

    private void finishSuccess(String text, String error, Float confidence) {
        getActivity().runOnUiThread(() -> {
            if (finishing || activeCall == null) return;
            finishing = true;
            PluginCall call = activeCall;
            activeCall = null;
            JSObject out = new JSObject();
            out.put("text", text == null ? "" : text);
            out.put("onDevice", usingOnDevice);
            if (error != null) out.put("error", error);
            if (confidence != null) out.put("confidence", confidence);
            destroyRecognizer();
            call.resolve(out);
        });
    }

    private void finishError(String message) {
        getActivity().runOnUiThread(() -> {
            if (finishing || activeCall == null) return;
            finishing = true;
            PluginCall call = activeCall;
            activeCall = null;
            destroyRecognizer();
            call.reject(message);
        });
    }

    private void cancelActive(String reason) {
        if (activeCall != null && !finishing) {
            finishing = true;
            PluginCall call = activeCall;
            activeCall = null;
            JSObject out = new JSObject();
            out.put("text", "");
            out.put("error", reason);
            out.put("onDevice", usingOnDevice);
            call.resolve(out);
        }
        destroyRecognizer();
    }

    private void destroyRecognizer() {
        if (recognizer != null) {
            try { recognizer.cancel(); } catch (Exception ignored) {}
            try { recognizer.destroy(); } catch (Exception ignored) {}
            recognizer = null;
        }
    }

    private String messageFor(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_AUDIO: return "Speech recognition audio error.";
            case SpeechRecognizer.ERROR_CLIENT: return "Speech recognition client error.";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: return "Microphone permission is required for voice commands.";
            case SpeechRecognizer.ERROR_NETWORK: return "Speech recognition network error.";
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: return "Speech recognition network timeout.";
            case SpeechRecognizer.ERROR_SERVER: return "Speech recognition service error.";
            default: return "Speech recognition error (" + error + ").";
        }
    }

    private String safeMessage(Exception error) {
        String message = error == null ? null : error.getMessage();
        if (message == null || message.trim().isEmpty()) return "unknown error";
        message = message.replace('\n', ' ');
        return message.substring(0, Math.min(160, message.length()));
    }

    @Override
    protected void handleOnDestroy() {
        getActivity().runOnUiThread(() -> cancelActive("aborted"));
        super.handleOnDestroy();
    }
}
