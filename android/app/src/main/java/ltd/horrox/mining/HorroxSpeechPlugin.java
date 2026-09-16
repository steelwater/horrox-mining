package ltd.horrox.mining;

import android.media.AudioAttributes;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@CapacitorPlugin(name = "HorroxSpeech")
public class HorroxSpeechPlugin extends Plugin {

    private TextToSpeech speech;
    private boolean ready;
    private boolean initializationFailed;
    private final List<PluginCall> waitingCalls = new ArrayList<>();
    private final Map<String, PluginCall> activeCalls = new HashMap<>();

    @Override
    public void load() {
        speech = new TextToSpeech(getContext(), status -> {
            ready = status == TextToSpeech.SUCCESS;
            initializationFailed = !ready;

            if (ready) {
                speech.setAudioAttributes(
                    new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                );
                speech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override
                    public void onStart(String utteranceId) {}

                    @Override
                    public void onDone(String utteranceId) {
                        finishCall(utteranceId, null);
                    }

                    @Override
                    public void onError(String utteranceId) {
                        finishCall(utteranceId, "Android could not play this announcement.");
                    }
                });
            }

            List<PluginCall> queued = new ArrayList<>(waitingCalls);
            waitingCalls.clear();
            for (PluginCall call : queued) {
                if (ready) {
                    beginSpeaking(call);
                } else {
                    call.reject("Android text-to-speech is unavailable.");
                }
            }
        });
    }

    @PluginMethod
    public void speak(PluginCall call) {
        if (initializationFailed) {
            call.reject("Android text-to-speech is unavailable.");
            return;
        }
        if (!ready) {
            waitingCalls.add(call);
            return;
        }
        beginSpeaking(call);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        waitingCalls.forEach(waiting -> waiting.reject("Speech stopped."));
        waitingCalls.clear();
        activeCalls.values().forEach(active -> active.reject("Speech stopped."));
        activeCalls.clear();
        if (speech != null) speech.stop();
        call.resolve();
    }

    private void beginSpeaking(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.isBlank()) {
            call.reject("Speech text is required.");
            return;
        }

        String localeTag = call.getString("locale", "en-GB");
        Double rate = call.getDouble("rate", 1.0);
        Double pitch = call.getDouble("pitch", 1.0);
        speech.setLanguage(Locale.forLanguageTag(localeTag));
        speech.setSpeechRate(rate.floatValue());
        speech.setPitch(pitch.floatValue());

        String utteranceId = UUID.randomUUID().toString();
        activeCalls.put(utteranceId, call);
        int result = speech.speak(text, TextToSpeech.QUEUE_FLUSH, new Bundle(), utteranceId);
        if (result == TextToSpeech.ERROR) {
            finishCall(utteranceId, "Android could not start this announcement.");
        }
    }

    private void finishCall(String utteranceId, String error) {
        getActivity().runOnUiThread(() -> {
            PluginCall call = activeCalls.remove(utteranceId);
            if (call == null) return;
            if (error == null) call.resolve();
            else call.reject(error);
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (speech != null) {
            speech.stop();
            speech.shutdown();
        }
    }
}
