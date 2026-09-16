import { Preferences } from '@capacitor/preferences'
import type { FacilityState } from './types'

const SAVE_KEY = 'horrox-facility-v1'

export async function loadFacility(): Promise<FacilityState | null> {
  const { value } = await Preferences.get({ key: SAVE_KEY })
  if (!value) return null

  try {
    const parsed = JSON.parse(value) as Partial<FacilityState>
    if (parsed.version !== 1 || typeof parsed.createdAt !== 'number') return null
    return parsed as FacilityState
  } catch {
    return null
  }
}

export async function saveFacility(state: FacilityState): Promise<void> {
  await Preferences.set({ key: SAVE_KEY, value: JSON.stringify(state) })
}
