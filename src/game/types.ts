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
  version: 4
  operationStart: '2075-09-17'
  commissioned: boolean
  lastProcessedAt: number
  lastActiveAt: number
  miners: Miner[]
  vessels: Vessel[]
  repairDrones: RepairDrone[]
  repairJobs: RepairJob[]
  nextRepairId: number
  processingQueue: ProcessingLoad[]
  systems: FacilitySystems
  operations: OperationalEvent[]
  nextOperationId: number
  createdAt: number
  lastSavedAt: number
  /** Chronological elapsed time, independent of the simulation catch-up limit. */
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
  operationAgeMs: number
  priority: AudioPriority
}

// UTC epoch milliseconds are used for every persisted timestamp.
export type Vessel = {
  id: string
  name: string
  minerId: string
  condition: VesselCondition
  routineServiceDue: boolean
  runsSinceService: number
  activeFaults: VesselFault[]
  serviceHistory: string[]
  operatingRuns: number
  lastFaultRun: number
  resumeAfterRepair: boolean
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
  name: string
  targetId: string | null
  completesAt: number | null
  state: 'available' | 'dispatched' | 'in-transit' | 'servicing' | 'returning' | 'maintenance' | 'unavailable'
  location: string
  assignedJobId: string | null
  transitStartedAt: number | null
  serviceStartedAt: number | null
  maintenanceDue: boolean
  serviceHistory: string[]
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
  operationAgeMs: number
  source: string
  category: EventType | 'processing'
  summary: string
  relatedIds: string[]
  actionRequested: boolean
  resolution: 'pending' | 'manual' | 'autonomous'
  reason: string | null
  operationCode?: number
  repair?: RepairRecord
}

export type ChatterLine = { speaker: string; profile: string; text: string }
export type ChatterExchange = {
  id: string
  context: 'mining' | 'dock' | 'processing' | 'maintenance' | 'service'
  cooldownMs: number
  lines: ChatterLine[]
}

export type VesselCondition = 'nominal' | 'degraded' | 'fault' | 'critical' | 'offline'
export type FaultType = 'drill-wear' | 'thruster-malfunction' | 'sensor-degradation' | 'hull-damage' | 'communications-failure' | 'cargo-jam' | 'power-instability' | 'navigation-fault'
export type RepairAction = 'diagnostics' | 'drone' | 'dock' | 'safe-return' | 'continue' | 'stop' | 'crew' | 'recommend'
export type VesselFault = {
  id: string
  type: FaultType
  severity: VesselCondition
  detectedAt: number
  decisionAt: number | null
  escalatesAt: number | null
  resolvedAt: number | null
  action: RepairAction | null
  operationCode: number
  emergency: boolean
}
export type RepairJob = {
  id: string
  vesselId: string
  faultId: string
  method: 'remote-drone' | 'dock'
  assignedDroneId: string | null
  state: 'waiting' | 'dispatched' | 'in-transit' | 'returning-vessel' | 'docking' | 'servicing' | 'complete'
  createdAt: number
  dispatchedAt: number | null
  serviceStartedAt: number | null
  completedAt: number | null
  nextAt: number | null
  outcome: 'restored' | null
}
export type RepairRecord = {
  vesselId: string
  faultId: string
  faultType: FaultType
  subsystem: string
  severity: VesselCondition
  conditionBefore: VesselCondition
  conditionAfter: VesselCondition
  detectedAt: number
  actor: string
  action: RepairAction | null
  droneId: string | null
  jobId: string | null
  serviceStartedAt: number | null
  completedAt: number | null
  outcome: 'restored' | null
  availability: 'working' | 'available' | 'unavailable'
}
