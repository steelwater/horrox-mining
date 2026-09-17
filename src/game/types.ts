export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '*' | '#'

export type AudioPriority = 1 | 2 | 3 | 4 | 5 | 6

export type EventType = 'mining' | 'docking' | 'maintenance' | 'problem' | 'safety' | 'chatter'

export type EventDefinition = {
  id: string
  type: EventType
  priority: AudioPriority
  participants: string[]
  spokenLines: string[]
  responseOptions: Partial<Record<KeypadKey, string>>
  responseTimeoutMs: number
  autonomousFallback: string
  consequences: string[]
  prerequisites: string[]
  cooldownMs: number
  persistenceImpact: boolean
  immediateSafety?: boolean
}

export type VoiceProfile = {
  id: string
  locale: string
  rate: number
  pitch: number
  preferredNameHints: string[]
  fallbackOrder: string[]
}

export type Miner = {
  id: string
  name: string
  callsign: string
  role: string
  voiceProfileId: string
  personalityTraits: string[]
  speechHabits: string[]
  preferredCoworkers: string[]
  relationships: Record<string, string>
  competenceAreas: string[]
  currentMood: string
  currentAssignment: string
  history: string[]
}

export type OnboardingStatus = 'pending' | 'active' | 'complete' | 'skipped'

export type PendingEvent = {
  eventId: string
  requestedAt: number
}

export type FacilityState = {
  version: 2
  lastProcessedAt: number
  lastActiveAt: number
  miners: Miner[]
  vessels: Vessel[]
  repairDrones: RepairDrone[]
  processingQueue: ProcessingLoad[]
  systems: FacilitySystems
  operations: OperationalEvent[]
  nextOperationId: number
  createdAt: number
  lastSavedAt: number
  facilityAgeMs: number
  productionCycles: number
  oreProcessed: number
  equipmentWear: number
  autopilotEnabled: boolean
  onboardingStatus: OnboardingStatus
  onboardingStep: number
  pendingEvent: PendingEvent | null
  eventCooldowns: Record<string, number>
  history: string[]
  transcript: TranscriptEntry[]
}

export type TranscriptEntry = {
  id: string
  speaker: string
  text: string
  timestamp: number
  priority: AudioPriority
}

// UTC epoch milliseconds are used for every persisted timestamp.
export type Vessel = {
  id: string
  name: string
  minerId: string
  condition: 'nominal' | 'service-required'
  dockingState: 'deployed' | 'returning' | 'docked' | 'holding' | 'approaching'
  assignment: 'extraction' | 'delivery' | 'standby' | 'approach'
  startedAt: number
  completesAt: number | null
  cargo: number
  delivered: number
  run: number
  miningProgress: number
  cut: 'stable' | 'dense'
}

export type RepairDrone = {
  id: string
  targetId: string | null
  completesAt: number | null
}

export type ProcessingLoad = {
  id: string
  vesselId: string
  tonnes: number
  completesAt: number
}

export type FacilitySystems = {
  berth: 'open' | 'isolated'
  berthInspectionAt: number | null
  coolant: 'nominal' | 'inspection'
  coolantInspectionAt: number | null
  scanner: 'nominal' | 'manual-sampling'
  scannerCalibrationAt: number | null
}

export type OperationalEvent = {
  id: string
  timestamp: number
  source: string
  category: EventType | 'processing'
  summary: string
  relatedIds: string[]
  actionRequested: boolean
  resolution: 'pending' | 'manual' | 'autonomous'
  reason: string | null
}
