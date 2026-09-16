import { voiceProfiles } from '../game/content'
import type { AudioPriority, VoiceProfile } from '../game/types'

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
    gain.gain.value = 0.025

    hum.connect(filter)
    overtone.connect(filter)
    filter.connect(gain)
    gain.connect(context.destination)
    hum.start()
    overtone.start()

    this.context = context
    this.ambienceGain = gain
  }

  speak(text: string, profileId = 'terminal', priority: AudioPriority = 3): void {
    if (typeof speechSynthesis === 'undefined') return

    if (this.speaking && this.currentPriority !== null && priority < this.currentPriority) {
      speechSynthesis.cancel()
      this.speaking = false
      this.queue.unshift({ text, profileId, priority })
    } else {
      this.queue.push({ text, profileId, priority })
      this.queue.sort((a, b) => a.priority - b.priority)
    }
    this.playNext()
  }

  stop(): void {
    this.queue = []
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
    this.speaking = false
    this.currentPriority = null
    this.setAmbienceLevel(0.025)
  }

  private playNext(): void {
    if (this.speaking || typeof speechSynthesis === 'undefined') return
    const request = this.queue.shift()
    if (!request) return

    const profile = voiceProfiles.find((item) => item.id === request.profileId) ?? voiceProfiles[0]!
    const utterance = new SpeechSynthesisUtterance(request.text)
    utterance.rate = profile.rate
    utterance.pitch = profile.pitch
    utterance.lang = profile.locale
    utterance.voice = this.selectVoice(profile)
    utterance.onend = () => this.finishSpeech()
    utterance.onerror = () => this.finishSpeech()

    this.speaking = true
    this.currentPriority = request.priority
    this.setAmbienceLevel(0.008)
    speechSynthesis.speak(utterance)
  }

  private finishSpeech(): void {
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
