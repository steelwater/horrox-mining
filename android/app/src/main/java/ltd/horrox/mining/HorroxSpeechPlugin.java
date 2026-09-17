package ltd.horrox.mining;

import android.media.AudioAttributes;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
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
import java.util.Comparator;
import java.util.Set;

@CapacitorPlugin(name = "HorroxSpeech")
public class HorroxSpeechPlugin extends Plugin {

    private TextToSpeech speech;
    private boolean ready;
    private boolean initializationFailed;
    private final List<PluginCall> waitingCalls = new ArrayList<>();
    private final Map<String, PluginCall> activeCalls = new HashMap<>();
    private final List<Voice> availableVoices = new ArrayList<>();
    private final Map<String, Voice> profileVoices = new HashMap<>();

    @Override
    public void load() {
        speech = new TextToSpeech(getContext(), status -> getActivity().runOnUiThread(() -> {
            ready = status == TextToSpeech.SUCCESS;
            initializationFailed = !ready;

            if (ready) {
                Set<Voice> voices = speech.getVoices();
                if (voices != null) {
                    for (Voice voice : voices) {
                        if (!voice.isNetworkConnectionRequired()
                            && !voice.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) {
                            availableVoices.add(voice);
                        }
                    }
                    availableVoices.sort(Comparator.comparing(Voice::getName));
                }
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

                    @Override
                    public void onStop(String utteranceId, boolean interrupted) {
                        finishCall(utteranceId, "Speech stopped.");
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
        }));
    }

    @PluginMethod
    public void speak(PluginCall call) {
        getActivity().runOnUiThread(() -> speakWhenReady(call));
    }

    private void speakWhenReady(PluginCall call) {
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
        getActivity().runOnUiThread(() -> stopSpeaking(call));
    }

    private void stopSpeaking(PluginCall call) {
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
        String profileId = call.getString("profileId", "terminal");
        Voice voice = profileVoices.get(profileId);
        if (voice == null) {
            Locale locale = Locale.forLanguageTag(localeTag);
            List<Voice> candidates = new ArrayList<>();
            for (Voice candidate : availableVoices) {
                if (candidate.getLocale().getLanguage().equals(locale.getLanguage())) candidates.add(candidate);
            }
            candidates.sort(Comparator.comparingInt(candidate ->
                candidate.getLocale().equals(locale) ? 0 : 1));
            for (Voice candidate : candidates) {
                if (!profileVoices.containsValue(candidate)) { voice = candidate; break; }
            }
            if (voice == null && !candidates.isEmpty()) voice = candidates.get(0);
            if (voice != null) profileVoices.put(profileId, voice);
        }
        if (voice != null) {
            if (speech.setVoice(voice) == TextToSpeech.ERROR) {
                call.reject("Android could not select an installed voice.");
                return;
            }
        } else if (speech.setLanguage(Locale.forLanguageTag(localeTag)) < 0
            && speech.setLanguage(Locale.ENGLISH) < 0) {
            call.reject("No supported English speech voice is installed.");
            return;
        }
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
