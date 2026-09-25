# Milestone 3 — Vessel Damage & Repair Operations

Implementation record, 21 September 2026. Owner: Dan. Status: Dan reported playtesting complete and authorized Uplink on 24 September 2026; review preparation, not a release or deployment approval.

Canonical scope: [Milestone 3 Crew Brief](https://docs.google.com/document/d/1FeslP44gUyMT6Rk0nI0QaKhoXf1aUw3YDUmOhBSINgU/edit). Repository: [steelwater/horrox-mining](https://github.com/steelwater/horrox-mining). Feature branch: `codex/milestone-3-vessel-repairs`, based on Milestone 2 commit `baa962f`. Uplink authorizes commit, push, and a PR against `main`. Merge and release remain separate decisions.

## Outcome and boundaries

Vessels now carry named subsystem faults and persistent NOMINAL, DEGRADED, FAULT, CRITICAL, and OFFLINE conditions. Unsafe work stops immediately; recovery decisions retain the established five-minute response window. Crew and Facility Control act safely when it expires. No game-over, inactivity penalty, new top-level menu, dependencies, accounts, network service, cast, or lore arc was added. The existing Facility AI voice profiles, speech parameters, native speech implementation, and audio director are unchanged.

The existing two vessels and DR-01 remain the world inventory. Routine Milestone 2 maintenance remains separate from active faults. The new schema represents its old `service-required` condition with `routineServiceDue` so it cannot be confused with a named fault.

## Implementation

- `repairs.ts` contains the eight-fault library, condition calculation, context-sensitive actions and recommendations, deterministic wear inputs, resource assignment, and repair lifecycle.
- `operations.ts` defines stable routine, maintenance, and emergency codes. New reports speak individual digits and their plain-language meaning. History preserves numeric `operationCode`.
- `engine.ts` runs repair deadlines on the existing foreground/offline clock. The seven-day work cap and full elapsed station calendar remain intact. Reconnection summarizes one result per fault instead of replaying transit and service messages.
- `repairPersistence.ts` restores repair fields and checks references/deadlines; `persistence.ts` migrates schema 1–3 into schema 4 under the existing Preferences key. Active jobs, faults, drone phases, decisions, codes, and structured repair history survive reload.
- `useFacility.ts` integrates vessel support into existing keypad routing. Repeat and diagnostics preserve response deadlines. Expired choices cannot become unrelated commands.

Faults: drill wear, thruster malfunction, sensor degradation, hull damage, communications failure, cargo mechanism jam, power instability, and navigation fault. Definitions contain subsystem, severity, mining capability/efficiency, safe response, diagnostics, repair requirements/location, duration, and initial code.

Faults are tied to completed work, not wall-clock absence or random rolls. The first fault opportunity is after thirteen extraction runs, then every twelve runs, cycling through the library. Hull/cargo incidents occur during delivery/docking; other faults arise from equipment use. A repeat thruster incident after prolonged operating history can explicitly disable the vessel. Degraded operation has a thirty-minute service limit; diagnostics, repeat, and player absence do not reset it. Frequency and timing are conservative implementation values for Dan's playtest, not new lore.

Remote service reserves the drone at assignment, launches after one second, transits for two minutes, services for the fault-specific duration, and returns for two minutes. Every fourth fault-service assignment requires a three-minute drone inspection before reuse. Dock repair uses a two-minute return, one-minute approach/docking phase, and service duration. It waits for berth inspection and other dock-repair work. If propulsion is unavailable, remote service or drone-assisted recovery is required; the vessel never gains an invented ability to fly home.

All successful jobs restore their named subsystem. Other simultaneous faults remain active, so a repaired subsystem need not make the whole vessel nominal. Code 390 is recorded only when the last emergency fault is repaired. Queued requests cannot reuse a drone still travelling, servicing, returning, or under maintenance. Recommendations reflect active jobs, vessel capability, fixed local transit distance, berth/service occupancy, and drone availability.

## Keypad playtest

From the main terminal:

- **3 Mining:** opens vessel support when a fault exists; otherwise retains the existing mining preference flow.
- **1 Emergency:** opens urgent vessel recovery when present; otherwise retains the existing berth safety flow.
- **4 Docking:** opens support for a returning/docked vessel or a queued dock job; otherwise retains the existing hauler docking flow.
- **8 Facility:** reports drone state and assignment; ordinary facility status also includes drone inventory.
- **0 Repeat / Status:** reports fault, vessel, condition, active action and expanded code. In vessel support it repeats the current choices.

Within support: 1 diagnostics, 2 drone support, 3 dock repair, 4 safe return, 5 continue carefully, 6 stop work, 7 crew decision, 8 recommendation. Only valid choices appear. `#` cycles faults and `*` returns to the main terminal without cancelling safety deadlines. Stop work holds safely and allows Facility Control to arrange recovery after five minutes.

For reproducible browser scenarios, start Vite on a dedicated test port, then open `/tests/repair-playtest.html`. It provides scenarios A–F plus hull/dock service, phone/tablet frame sizes, and a twenty-minute absence. It replaces the test origin's save, so use disposable test storage. The fixture is outside the production build and adds no in-game controls.

## Codes

200-series: 201 diagnostics; 205 fault detected; 210 maintenance required; 215 repair requested; 220 drone assigned; 225 dispatched; 230 service in progress; 235 dock repair required; 240 recall; 245 complete; 250 incomplete/further service; 290 maintenance resolved.

300-series: 301 general emergency; 302 impact; 303 hull breach; 304 fire; 305 electrical fire; 306 volatile leak; 310 evacuation; 315 disabled; 320 stranded; 325 emergency docking; 330 emergency landing; 340 life support; 350 external hazard; 390 resolved.

The complete brief-defined vocabulary is registered; actual modeled incidents emit applicable codes (including 301, 302, 315, 325, 390). Fire, evacuation, life-support, and other unmodeled events are vocabulary reservations, not invented simulation systems. This implementation uses deterministic full subsystem restoration; 250 remains available for later partial service outcomes.

## Persistence and history

Each repair event stores vessel/fault identity, fault type/subsystem/severity, condition before/after, detection time, actor/action, drone/job identity, service/completion timestamps, outcome, and resulting availability, alongside existing resolution/reason/summary fields. Jobs and vessel/drone service-history references preserve operational context. Existing bounded history remains: 1,000 operational events and the latest 100 completed repair jobs; active jobs are retained. Saves remain local to one installation, and simultaneous browser writers remain unsupported.

Schema 4 adds these fields without changing the save key or resetting existing commissioning, station age, cargo, production, ordinary pending requests, or history. Missing old fields receive safe defaults. Invalid references return a fault to a recoverable decision; stale drone deadlines are removed from job-driven phases. Unknown future schema versions still block load without overwriting the save.

## Verification

- 83 automated tests pass: all 58 original regressions plus 25 repair/keypad tests. Coverage includes all eight faults, five conditions, diagnostics, reduced capability, deterministic escalation, manual/no-response decisions, safe hold, remote/dock lifecycle, berth isolation, resource contention, unavailable drone queues, simultaneous emergencies, drone maintenance, stable codes, malformed deadlines, old-save migration, phase-by-phase reload equivalence, no duplicate catch-up, and concise return summaries.
- Type checking, production web build, and Capacitor Android/iOS asset synchronization pass.
- Android debug assembly passes using the installed Android Studio JDK and existing Gradle cache. Existing flatDir warnings remain. No APK was installed or published.
- Browser checks used the real app in isolated test storage: degraded-drill diagnostics/repeat/continue; remote dispatch and time-away completion; OFFLINE/315 recommendation and autonomous emergency recovery; competing demand, next-fault selection, unavailable-drone recommendation and manual dock fallback. Checked menus at 390px and an 800px iframe (785px content width with scrollbar), with no horizontal overflow or text overlap. Return outcomes survived reload and were readable.
- Final scoped diff and whitespace checks reviewed. Voice configuration and audio implementation have no diff. No lint script exists.

Not run by the agent: physical phone/tablet playtest, native audible comparison, Bluetooth keypad/audio, iOS build/runtime, and device termination/background checks. Dan subsequently reported completing playtesting; device and scenario details were not specified. These require the corresponding device sessions. Existing screen-off catch-up remains supported; continuous locked-screen speech is still deferred.

## Next step and rollback

Dan authorized Uplink after playtesting on 24 September 2026. Next: First Officer/Captain review of the PR after its latest CI checks pass. Uplink does not authorize merging, deployment, release, or cleanup.

Rollback is the feature-branch boundary at `baa962f`; no deployment occurred. Before testing an older app against a schema-4 installation, preserve its Preferences save. Older versions reject newer schema saves; do not reset a live operation to roll back code. Generated web/native artifacts remain ignored and are not release archives.

## Uplink verification — 24 September 2026

Re-ran all 83 Vitest tests, TypeScript checking, and the production web build successfully. Reused the earlier browser and native debug-build evidence and Dan's reported playtest. No gameplay changes were made during Uplink. The existing Web CI workflow verifies dependency installation, tests, type checking, and build on Node 24; the latest PR commit must pass before handoff. No lint script exists.

Reviewed Google's official [testing/testing-setup skill](https://github.com/android/skills/blob/main/testing/testing-setup/SKILL.md), using its current-test-inventory analysis. The app is a Vue/Capacitor WebView shell; Android declares JUnit4 and AndroidX/Espresso with generated example tests. Milestone 3 business logic is covered by Vitest, and no native Android source or configuration changed. Native DI, Compose, screenshot-framework installation, R8, Play, profiling, and edge-to-edge skills are not applicable to this Uplink scope. No new testing dependencies or persistent skill configuration were added. Instrumented/native screenshot checks were not run; earlier browser checks and Dan's playtest remain the experience evidence.

GitHub's branch-protection endpoint reports HTTP 403: this private repository requires GitHub Pro or public visibility to enable the feature. No subscription, visibility, or protection change was made. CI is still followed through completion as the review gate.

## Milestone 3 follow-up — 25 September 2026

Authority: [Playtest Fixes & Save Tools Crew Brief](https://docs.google.com/document/d/1EX_KnELwg7UkkG1D3HPb68h12kcnEMgBmG3oamHAxHg/edit), governed by the [Immersion Milestone Plan](https://docs.google.com/document/d/1UIqXtDuXe7g4oSaI44l9ETkWiT705KV050qhLDV4n5A/edit). Owner: Dan. Branch: `feat/milestone-3-followup`, based on latest merged `main` at `6b1dfb9`. The earlier core-Milestone-3 acceptance does not close this follow-up. Dan's playtest and acceptance remain required.

### Behavior

Speech carries request/response cause identifiers. Valid decisions still update state immediately. Non-safety speech finishes its current line, then operational traffic plays in causal order ahead of ordinary reports/chatter. Safety reports still interrupt immediately; interrupted operational context is retained so later answers remain understandable. Vessel support, repeat/next-fault menus, and repair progress share this ordering. Voice profiles, native provider, rate, pitch, identity, and other voice parameters are unchanged.

A first sensor-degradation report now occurs two minutes into active extraction when the operation has no previous repair record (`nextRepairId === 1`). It is a real persisted fault: reduced extraction, five-minute response deadline, drone reservation/transit/service, and recovery history. An established operation with no prior repairs encounters it on its active extraction run; an operation with previous repairs retains its existing cadence. The persistent repair counter prevents replay after reload or readiness review. Subsequent wear remains every twelve runs beginning at run thirteen. A captain dispatching support promptly can finish service within ten minutes; unattended play requests support at minute seven and begins service just after minute nine, finishing just after minute thirteen. No response timeout or service duration was shortened.

Foreground repair transitions are announced in event order instead of selecting only one report from a tick. Ambient exchanges have 90-second opportunities and a five-minute per-exchange cooldown, restored from retained transcript entries after reconnect/import. Open operational decisions suppress ambient chatter. There are no canned repair lines detached from simulation state.

The secondary terminal menu provides Copy Transcript, Export Save, and Import Save. The keypad map is unchanged. JSON textareas support ordinary typing, selection and copy/paste without routing those keystrokes into operational commands. Copy feedback is visual. Clipboard failure reports an error; export remains selectable for manual copy. Export text is read-only; import text is editable. Editing validated text invalidates confirmation. Replacement requires a separate **CONFIRM REPLACE OPERATION** action.

### Build and portable-save contract

`package.json` is the maintained source for `version` and `milestone`; `src/game/build.ts` derives the shared metadata and label. Current web build identity: **V0.1.0 / MILESTONE 3**. This does not create a release/tag or change native store versions. The footer is secondary, visible in standard/dim modes, and hidden with the terminal in black mode.

The JSON envelope contains:

- `format`: `horrox-mining-portable-save`;
- `schemaVersion`: independent persistent model version, currently 4;
- `appVersion` and `milestone`: from the shared build source;
- `exportedAt`: ISO timestamp;
- `state`: the complete persistent `FacilityState`, including commissioning, station age, crew, vessels/cargo/assignments, faults, repair jobs/drones, requests, processing, history/transcript and autopilot preference.

No audio handles, timers, browser/native objects, downloads, file pickers, share sheets, cloud services or dependencies are added. Display mode and utility UI state remain session-local, as before.

Portable import accepts complete schema 3 or 4 envelopes. Schema 3 uses normal migration to schema 4. Schema 1/2 installation saves continue to load through existing tolerant migration; open those in the current app and export the migrated operation before moving it. Portable input is deliberately stricter than installation recovery: malformed JSON, wrong format, missing state/required nested fields, bad values/references, duplicate/missing fixed entities, and future schemas fail before storage mutation. A save ahead of the device clock is rejected with a clock-correction message. Current-schema normalization must preserve the supplied state rather than silently dropping/correcting fields. History remains bounded by the existing persistence limits.

After explicit confirmation, replacement joins the existing serialized Preferences write queue. Autosaves and input pause for the transaction. The exact previous saved bytes are retained, the imported state is written/read through normal persistence, elapsed time is caught up using the normal simulation, and the restored state is saved. The live operation changes only after success. Failure restores the prior stored bytes and keeps the current live session; if storage also refuses rollback, the UI tells the player to retain the session and retry saving. There is no extra user-managed backup file. Elapsed real time during transfer is intentionally included, matching ordinary reconnect behavior.

Future persistent changes must update schema/validation/migration and round-trip tests together. Export must remain a complete restorable operation, and validation must remain separate from mutation.

### Verification and Captain playtest

Final local checks: all **108 tests pass**; `npm run typecheck`, `npm run build` (also run through `npm run cap:sync`), and Capacitor Android/iOS asset sync pass. Android debug assembly passes using the established Android Studio JDK; existing flatDir warnings remain. No APK was installed or published.

Automated coverage includes causal queue order and immediate decision application, safety interruption/replay, normal early service and conservative later cadence, ambient cooldown, version metadata, chronological transcript formatting, complete repair-phase round trips, schema 3 migration, malformed/missing/invalid/future input, and rollback after read/write failure. Existing production-deadline fixtures explicitly represent an operation that has already encountered its first service interaction; dedicated fresh-operation tests cover the new cadence.

Browser checks use an isolated local test origin. Observed: normal sensor fault at two minutes; five-minute autonomous response, drone dispatch and service underway within the ten-minute session (including ordinary reconnects during development); text copy with version/station timestamps; export → Copy → system paste → validate → explicit confirmation → restored active fault; malformed text rejected without replacement; physical number input after a touchscreen command. Phone (390px) and tablet (800px) layouts were inspected, including long JSON and error feedback, without horizontal overflow.

The original queue sequence was also manually reproduced at `/tests/followup-playtest.html`: docking changed to approaching while only the ordinary line had started; completing that line started the incoming request; completing the request started confirmation; safety interrupted immediately. This development-only page uses the real audio director and an in-memory engine with a controlled speech adapter. It verifies causal playback calls, not audible hardware TTS.

Captain playtest:

1. On a fresh operation, delegate commissioning and listen for the sensor fault at roughly two minutes. Press 3, then 1 for diagnostics and 2 for drone support, or wait for the five-minute autonomous choice. Listen through transit, service and completion.
2. While a normal report is speaking, open a request and immediately choose an answer. State should change immediately; the request must be heard before confirmation. Check genuine safety interruption separately.
3. Open the terminal menu, Copy Transcript, and paste into a text editor. Verify chronological station timestamps and build header.
4. Export Save, Copy, then Import Save and paste. Validate, inspect the replacement warning, then confirm. Check state/history and normal elapsed-time catch-up. Try malformed text and Cancel as separate cases.
5. Check standard/dim/black display, phone/tablet readability, and native clipboard/TTS/physical Bluetooth input on the intended device.

Google's official [testing/testing-setup skill](https://github.com/android/skills/blob/main/testing/testing-setup/SKILL.md) informed the test inventory: this is a Vue/Capacitor WebView app with Vitest behavior coverage and existing JUnit4/AndroidX/Espresso shell dependencies. Native source/configuration is unchanged. DI/Compose, R8, Play, profiling, and new screenshot frameworks are outside this follow-up; none was installed.

Physical device listening/clipboard, Bluetooth, iOS build/runtime, and device termination/background behavior were not verified by the agent. Continuous locked-screen speech remains deferred. GitHub protection configuration still returns HTTP 403 on this private repository's current plan; no visibility/subscription/protection change is made. The configured Web CI result on the latest PR commit is the remote handoff gate. No lint script exists.

Rollback remains the isolated feature branch at base `6b1dfb9`; no merge, release, deployment, save reset, or cleanup is authorized. Schema 4 is unchanged. Preserve a portable export before testing a different build against an existing installation. Next: Dan reviews and playtests the follow-up PR after CI completes.
