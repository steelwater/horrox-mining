import type { FacilityState, KeypadKey } from './types'
export type KeypadModality = 'touch' | 'keyboard' | 'unknown'
export function instructionForKey(key: KeypadKey, label: string, protectedAction: boolean, holdSeconds: number, modality: KeypadModality = 'unknown'): string {
  const action = label.toLowerCase().replace(/[.]$/, '')
  if (!protectedAction) return `Press ${key} for ${action}.`
  const seconds = Math.max(1, Math.min(5, Math.round(holdSeconds)))
  const duration = `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`
  if (modality === 'keyboard') return `Press ${key}, release, wait ${duration}, then press ${key} again for ${action}.`
  if (modality === 'touch') return `Press and hold ${key} for ${duration} for ${action}.`
  return `For ${action}, hold ${key} for ${duration} on touch, or press, release, wait, and press ${key} again on a keyboard.`
}
export function repairActionProtected(state: FacilityState, action: string): boolean {
  return state.keypadProtection.mode === 'all' || (state.keypadProtection.mode === 'critical' && action !== 'diagnostics' && action !== 'recommend')
}

export type SpokenMenuOption = { key: KeypadKey; label: string; protectedAction: boolean }
export function spokenMenuChoices(options: SpokenMenuOption[], holdSeconds: number): string {
  if (!options.length) return ''
  const unprotected = options.filter(option => !option.protectedAction)
  const protectedOptions = options.filter(option => option.protectedAction)
  const plain = unprotected.map(({ key, label }) => instructionForKey(key, label, false, holdSeconds)).join(' ')
  if (!protectedOptions.length) return plain
  const seconds = Math.max(1, Math.min(5, Math.round(holdSeconds)))
  const duration = `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`
  const guide = `Protected choices: on touch, hold the chosen key for ${duration}. On a keyboard, press the key, release, wait ${duration}, then press the same key again.`
  const choices = protectedOptions.map(({ key, label }) => `${key}: ${label.toLowerCase().replace(/[.]$/, '')}.`).join(' ')
  return `${guide} ${choices} ${plain}`
}
