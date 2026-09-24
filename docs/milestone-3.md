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
