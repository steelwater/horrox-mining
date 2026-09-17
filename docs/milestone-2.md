# Milestone 2 — The Living Mine

Implementation record, 17 September 2026. Owner: Dan. Status: implementation for review; no release or deployment authorized by this record.

Canonical scope: [Milestone 2 Crew Brief](https://docs.google.com/document/d/1z4XdfSmxUQitOvMrb87Cztb1MBMKvapDhYRaKurQIhI/edit). Repository: [steelwater/horrox-mining](https://github.com/steelwater/horrox-mining). Branch: `codex/milestone-2-living-mine`, based on `c659d9e` on `main`.

## Behavior and implementation

Schema version 2 extends the existing Capacitor Preferences save with miners, two named vessels, one repair drone, assignments, vessel condition and docking state, carried/delivered cargo, extraction progress, a processing queue, facility systems, and structured operational history. All timestamps are UTC epoch milliseconds. Existing voice profiles, native voice selection, and speech parameters are unchanged.

`advanceFacility` is the only production clock, used both during active play and after reopening/resuming. Stable extraction takes 15 minutes, delivery takes 2 minutes, and processing takes 3 minutes per queued load. The selected cut sets the current extraction deadline, or the next run when already returning: 20 minutes for 16 tonnes, versus 15 minutes for 12 tonnes. Every fourth run receives five minutes of dockside drone service. Service-required vessels return safely; they do not continue extracting. Autopilot no longer creates an independent, faster production counter. Normal work continues whether autopilot is enabled or disabled.

Catch-up follows timestamped events, rather than simulating individual seconds. `lastProcessedAt` prevents duplicate progress and preserves partial work across saves. Each catch-up is capped at seven days; any remaining scheduled work is shifted forward, and the entire elapsed interval is consumed. No inactivity damage, catastrophic outcomes, or game-over path is introduced. The existing wear counter is preserved for compatibility but is not increased by absence.

Requests retain their original five-minute deadline across repeat, reload, and unrelated input. Crew resolves ordinary preferences; cross-system scanner issues escalate to facility control, which selects manual sampling while calibration completes. Berth safety isolation is immediate and prevents unsafe approaches. Manual decisions update operational state as well as history. Late responses cannot override an expired decision or accidentally become emergency commands.

History entries contain ID, timestamp, source, category, summary, related IDs, whether input was requested, resolution mode, and an autonomous reason. The terminal retains the latest 1,000 meaningful operational entries, separately from the existing 80-message speech transcript and 100-entry legacy history. The history remains an optional terminal disclosure rather than a dashboard.

Returning after at least one minute produces a concise spoken/text briefing, prioritizing safety, autonomous preference resolution, maintenance, and recent completed work. Short reconnects provide current status. Empty absences are reported plainly. Key 0 repeats onboarding or an open request; otherwise it speaks live operational status. Crew, Processing, and Facility status channels also use current state. The top-level command mapping remains unchanged; no Repairs menu is added.

## Save handling

The key remains `horrox-facility-v1`, allowing in-place migration. Version 1 counters, history, pending request, onboarding, and autopilot preferences survive; missing world entities receive safe defaults at the prior save time. Field validation covers missing fields, malformed numbers, invalid timestamps, and invalid references. Unknown future versions and unreadable JSON stop initialization and show a retryable error without replacing the stored operation. Saves are snapshotted and serialized so older asynchronous writes cannot overwrite newer state. Startup catch-up is saved immediately; active sessions save every 30 seconds, on commands/events, and on visibility changes.

Commands no longer wait for audio permission/resume, which could otherwise prevent status and decisions from completing. No audio implementation or voice configuration was edited.

## Verification

- 43 automated tests: existing command/onboarding/audio regressions plus persistence round-trip, foreground/offline equivalence, partial progress, queued processing, routine service, safe return, five-minute timeout, manual resolution, facility escalation, immediate safety, chronology/reasons, return briefings, missing/old/malformed saves, clock limits, duplicate prevention, resume behavior, late-input handling, and exact terminal voice-profile preservation.
- TypeScript checking and production web build passed.
- Capacitor Android/iOS asset synchronization and Android debug build passed using the existing Android Studio JDK and Gradle installation.
- Browser checks at 390 × 844 and 820 × 1180: live status, empty history, docking request, reload with pending request intact, request repeat, keyboard response, and readable structured history. No layout overflow observed in these flows.
- There is no configured lint script or repository CI workflow.

## Limits and next step

Dan should review the PR and test on a target phone before acceptance. No Android device/emulator was connected. Native listening comparison, Bluetooth keypad/audio, device background/termination behavior, and iOS runtime/build verification were not performed. The current voice configuration and playback implementation are unchanged, but an audible device comparison still needs Dan's check.

The prototype has one extraction vessel, a visiting hauler, one processor, and one drone. History is bounded, saves are local to one app installation, and simultaneous browser-tab writers are not coordinated. Discovery content and detailed repair/damage mechanics remain deferred. Milestone 3 can extend the existing vessel/drone/system IDs, condition, assignment, deadlines, and operational events, with separate vessel-support, dockside-service, facility-maintenance, and emergency routing as directed by its brief. No new dependencies, accounts, backend, telemetry, voice UI, deployment, or release artifacts were added.

Rollback: this work is isolated on a feature branch; `main` remains unchanged. Version 2 writes use the existing local save key. Before testing an older app against a migrated installation, preserve its Preferences save; the old app cannot read schema version 2. No production save or deployed app was changed by this implementation.
