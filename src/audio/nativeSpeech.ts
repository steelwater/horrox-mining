import { Capacitor, registerPlugin } from '@capacitor/core'

type SpeakOptions = {
  text: string
  locale: string
  rate: number
  pitch: number
}

type HorroxSpeechPlugin = {
  speak(options: SpeakOptions): Promise<void>
  stop(): Promise<void>
}

const HorroxSpeech = registerPlugin<HorroxSpeechPlugin>('HorroxSpeech')

export function canUseNativeSpeech(): boolean {
  return Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('HorroxSpeech')
}

export async function speakNatively(options: SpeakOptions): Promise<void> {
  await HorroxSpeech.speak(options)
}

export async function stopNativeSpeech(): Promise<void> {
  if (!canUseNativeSpeech()) return
  await HorroxSpeech.stop()
}
