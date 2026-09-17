import { voiceProfiles } from '../game/content'
import type { AudioPriority, VoiceProfile } from '../game/types'
import { canUseNativeSpeech, speakNatively, stopNativeSpeech } from './nativeSpeech'

type SpeechRequest = {
  text: string
  profileId: string
  priority: AudioPriority
}

export class AudioDirector {
  private context: AudioContext | null = null
  private ambienceGain: GainNode | null = null
  private queue: SpeechRequest[] = []
  private speaking = false
  private currentPriority: AudioPriority | null = null
  private playbackId = 0
  private stopping = false

  async startAmbience(): Promise<void> {
    if (this.context) {
      await this.context.resume()
      return
    }
    if (typeof AudioContext === 'undefined') return

    const context = new AudioContext()
    const hum = context.createOscillator()
    const overtone = context.createOscillator()
    const filter = context.createBiquadFilter()
    const gain = context.createGain()

    hum.type = 'sine'
    hum.frequency.value = 54
    overtone.type = 'triangle'
    overtone.frequency.value = 108
    filter.type = 'lowpass'
    filter.frequency.value = 240
    gain.gain.value = this.speaking ? 0.008 : 0.025

    hum.connect(filter)
    overtone.connect(filter)
    filter.connect(gain)
    gain.connect(context.destination)
    hum.start()
    overtone.start()

    this.context = context
    this.ambienceGain = gain
    await context.resume()
  }

  playKeyTone(key: string): void {
    if (!this.context) return

    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    const keyIndex = '123456789*0#'.indexOf(key)
    oscillator.type = 'sine'
    oscillator.frequency.value = keyIndex >= 0 ? 420 + keyIndex * 22 : 420
    gain.gain.setValueAtTime(0.08, this.context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.08)
    oscillator.connect(gain)
    gain.connect(this.context.destination)
    oscillator.start()
    oscillator.stop(this.context.currentTime + 0.08)
  }

  speak(text: string, profileId = 'terminal', priority: AudioPriority = 3): void {
    const nativeSpeech = canUseNativeSpeech()
    if (!nativeSpeech && typeof speechSynthesis === 'undefined') return

    if (this.speaking && this.currentPriority !== null && priority < this.currentPriority) {
      this.queue.unshift({ text, profileId, priority })
      this.playbackId += 1
      this.speaking = false
      if (nativeSpeech) {
        this.stopping = true
        void stopNativeSpeech().catch(console.warn).finally(() => {
          this.stopping = false
          this.playNext()
        })
      } else if (typeof speechSynthesis !== 'undefined') {
        speechSynthesis.cancel()
      }
    } else {
      this.queue.push({ text, profileId, priority })
      this.queue.sort((a, b) => a.priority - b.priority)
    }
    this.playNext()
  }

  stop(): void {
    this.queue = []
    this.playbackId += 1
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
    void stopNativeSpeech().catch(console.warn)
    this.speaking = false
    this.currentPriority = null
    this.setAmbienceLevel(0.025)
  }

  private playNext(): void {
    if (this.speaking || this.stopping) return
    const request = this.queue.shift()
    if (!request) return

    const profile = voiceProfiles.find((item) => item.id === request.profileId) ?? voiceProfiles[0]!
    this.speaking = true
    this.currentPriority = request.priority
    this.setAmbienceLevel(0.008)
    const playbackId = ++this.playbackId

    if (canUseNativeSpeech()) {
      void speakNatively({
        text: request.text,
        locale: profile.fallbackOrder[0] ?? profile.locale,
        rate: profile.rate,
        pitch: profile.pitch,
        profileId: profile.id,
      }).then(
        () => this.finishSpeech(playbackId),
        (error) => {
          // Cancellation can settle after the replacement announcement has started.
          if (playbackId !== this.playbackId) return
          console.warn('Speech playback failed', error)
          this.finishSpeech(playbackId)
        },
      )
      return
    }

    if (typeof speechSynthesis === 'undefined') {
      this.finishSpeech(playbackId)
      return
    }

    const utterance = new SpeechSynthesisUtterance(request.text)
    utterance.rate = profile.rate
    utterance.pitch = profile.pitch
    utterance.lang = profile.locale
    utterance.voice = this.selectVoice(profile)
    utterance.onend = () => this.finishSpeech(playbackId)
    utterance.onerror = () => this.finishSpeech(playbackId)

    speechSynthesis.speak(utterance)
  }

  private finishSpeech(playbackId: number): void {
    if (playbackId !== this.playbackId) return
    this.speaking = false
    this.currentPriority = null
    this.setAmbienceLevel(0.025)
    this.playNext()
  }

  private selectVoice(profile: VoiceProfile): SpeechSynthesisVoice | null {
    const voices = speechSynthesis.getVoices()
    for (const hint of profile.preferredNameHints) {
      const match = voices.find((voice) => voice.name.toLowerCase().includes(hint.toLowerCase()))
      if (match) return match
    }
    for (const locale of profile.fallbackOrder) {
      const match = voices.find((voice) => voice.lang.toLowerCase().startsWith(locale.toLowerCase()))
      if (match) return match
    }
    return voices.find((voice) => voice.lang.toLowerCase().startsWith(profile.locale)) ?? voices[0] ?? null
  }

  private setAmbienceLevel(level: number): void {
    if (!this.context || !this.ambienceGain) return
    this.ambienceGain.gain.setTargetAtTime(level, this.context.currentTime, 0.08)
  }
}
