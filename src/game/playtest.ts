import type { FaultType } from './types'

/** Explicit test build only. Normal production builds retain the original wear schedule. */
export const CRITICAL_PLAYTEST_RUN_INTERVAL = 2
export function criticalPlaytestEnabled(): boolean {
  return import.meta.env.MODE === 'playtest'
}

// Alternate critical and ordinary faults so existing saves also reach an emergency soon.
export const CRITICAL_PLAYTEST_SEQUENCE: FaultType[] = [
  'hull-damage', 'sensor-degradation', 'power-instability', 'drill-wear',
  'hull-damage', 'thruster-malfunction', 'power-instability', 'communications-failure',
  'hull-damage', 'cargo-jam', 'power-instability', 'navigation-fault',
]
