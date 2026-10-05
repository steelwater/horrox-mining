# Post-Milestone 3 Operations Flow & Chatter Polish

Implementation handoff — 30 September 2026. Owner: Dan.

Authority: [Crew Brief](https://docs.google.com/document/d/1LlOOn_CHn1iPsqt2mO-jb_TAPBvPwCfRXOYLEAnJAwE/edit), with the [Roadmap](https://docs.google.com/document/d/1UIqXtDuXe7g4oSaI44l9ETkWiT705KV050qhLDV4n5A/edit) governing milestone boundaries and the repository README governing lore. Repository: `steelwater/horrox-mining`. Branch: `codex/operations-flow-chatter-polish`, based on merged PR #8 at `024a823`.

## Result

The prototype chatter pool grows from four exchanges to 24. Eligibility follows actual mining, docked Hauler, processing, maintenance and active-service conditions. A faulty or unavailable excavator cannot supply the working-drill joke. The unsupported early-arrival claim is replaced with a docked-Hauler remark; no early-arrival model is invented. All dialogue remains prototype content pending content-owner approval.

Each exchange has a 30–60 minute station-time cooldown. Opportunities remain every 90 seconds, with a 65% chance to speak only when eligible, at least two minutes between exchanges, and a 30-second quiet interval after operational traffic. Pending requests, emergencies, berth isolation and returning/approaching vessels suppress ambient chatter. Operational speech discards an unfinished ambient reply, including when the first line is still speaking. These are initial tuning values for Captain playtesting.

The first spoken line records the exchange ID and station age in the existing bounded operational history. Cooldowns therefore survive transcript rollover and export/import without a new save field or schema. Old saves can seed recent use from their retained transcript. Chatter entries are excluded from return summaries. Operational history still retains at most 1,000 entries; no unbounded bookkeeping is added.

Real vessel faults identify the assigned crew requester. Control acknowledges the request and directs the captain into the existing vessel-support channel, whose choices continue to come from `repairOptions`. The reusable announcement handoff tags both crew and Control lines with the fault's request cause. Applied decisions and repair transitions use the same cause, preserving request-before-response audio. A communications-failure report uses telemetry/Control instead of pretending the affected crew has a working primary radio. Optional crew replies are omitted in this pass.

Captain decisions still change simulation state immediately. Control relays the actual assigned drone and resulting status. Unanswered requests retain the existing five-minute safe autonomous decision. Drone support labels distinguish immediate availability from queued support; holding text no longer claims a drone is unavailable when it is available. The established Facility Control identity and voice configuration remain unchanged; this does not introduce the later Fran naming arc.

Short reconnects suppress the full report only when a recent full briefing already contains the same current status and no new operations occurred during the absence. Changed requests/warnings/status, newly recorded operations, a five-minute absence, or five minutes since the last full briefing produce another report. Sub-minute absences now summarize meaningful completed work too. Elapsed-time text handles singular minutes and hours.

## Verification

- All 127 Vitest tests pass, including the existing repair lifecycle, safe autonomy, save migration/import/export, transcript tools, display modes, keypad routing and speech queue regressions.
- New tests cover state-gated chatter, long cooldown persistence after transcript rollover and portable round trip, a simulated two-hour unattended operation with varied exchanges and no short repeat loops, crew/Control/captain causal ordering, operational preemption of ambient replies, actual resource choices, reconnect suppression, sub-minute completed work and singular units.
- `npm run typecheck`, `npm run build`, and `git diff --check` pass. No lint script exists.
- Real browser terminal on isolated localhost storage: normal crew request → Control confirmation → touchscreen vessel-support channel → keyboard drone dispatch → transit report. Transcript shows the crew and Control before the decision. Copy Transcript reports success; system clipboard contents were not independently verified.
- Inspected 390px phone and 800px tablet fixture layouts, including High Contrast White and High Contrast Dark; observed readable wrapping and controls. No UI/CSS changes were needed.

Not run: physical mobile listening, Bluetooth input/audio, native Android/iOS builds or device runtime, a long real-time mobile listening session, and remote CI. No native code changed. Existing automated tests cover portable import and delivery/processing; these were not all replayed manually in this pass. Native listening remains necessary to judge cadence and voice experience. Continuous locked-screen speech remains deferred.

## Playtest and stopping point

Use normal operation for a reasonably long mobile session and export its transcript. Check variety, sufficient silence, factual chatter, crew/Control/decision order, safe unattended repair, quick reconnects, and singular elapsed wording. In vessel support, test dispatch with an available drone and queue/delegation when occupied.

For a faster browser check, run Vite on a dedicated disposable port and open `/tests/repair-playtest.html`. The added “Normal crew request in five seconds” scenario starts just before the existing two-minute sensor incident; it changes only the fixture's test clock. Other repair scenarios and phone/tablet controls remain available.

Implementation is local and uncommitted for review. No Uplink, push, PR, merge, deployment, release/version change, dependency addition, personality system, or cleanup was performed. V0.1.0 / MILESTONE 3 and save schema 4 remain unchanged. Next: Dan's review and mobile transcript playtest, then Uplink when authorized.

Rollback boundary: main at `024a823`; no production deployment or live-save reset occurred. Keep a portable export before testing another build against an existing installation. Dan explicitly approved uploading this handoff to the existing project Drive folder on 30 September 2026 and requested a local debug APK for testing. The APK build is a follow-up to the implementation checks above; no release or Uplink is authorized.

## Requested Android test build — 30 September 2026

Built the current uncommitted feature-branch work using the existing Android Studio JDK and Gradle wrapper. Web/type build, Capacitor sync, and `assembleDebug` passed; existing flatDir warnings remain. The initial sandbox attempt could not lock the Gradle cache; the approved build retry succeeded. No source or native configuration changes were needed for packaging.

APK: `android/app/build/outputs/apk/debug/horrox-operations-polish-2026-09-30-debug.apk` (4,192,505 bytes). SHA-256: `86773c1875e5c59d33c7989b2d6fdd5803fe3b893742d1c428b730a647f307ba`. Signature verification passed, and all four packaged web assets were compared byte-for-byte with the current production build. Package: `ltd.horrox.mining`, minimum Android API 24. This is a local debug test artifact, not a release. It includes the working-tree changes beyond base `024a823`; it must not be represented as a clean commit build. Native versionCode 1/versionName 1.0 and the in-app V0.1.0 / MILESTONE 3 label are unchanged.

Applied the inventory guidance in Google's official [Android testing/setup skill](https://github.com/android/skills/blob/main/testing/testing-setup/SKILL.md). Existing coverage uses Vitest for Vue/TypeScript behavior and JUnit4/AndroidX/Espresso dependencies for the Capacitor shell. No new testing or DI framework was introduced. Compose, R8, Play and profiling skills do not apply to this debug packaging request. No APK installation, instrumented/device test, Bluetooth test, or native listening test was performed. Prior 127-test and browser evidence remains applicable because the app source did not change during packaging.

Export your current save before installing. If Android rejects an update due to a signing-key mismatch, retain the export before any uninstall; uninstalling removes local app data. The checksum sidecar is beside the APK. The artifact remains in the ignored Android build directory and is not committed or published as a release.

## Uplink authorization — 30 September 2026

Dan authorized Uplink while mobile playtesting continues. The scope is this operations-polish change on `codex/operations-flow-chatter-polish`, targeting `main`. Re-ran all 127 tests, type checking and production build successfully. Reuse the preceding browser, Android debug-build, signature and packaged-asset verification; app source is unchanged from the supplied APK. No lint script exists. Generated APKs and web/native assets remain excluded from the commit.

The earlier local-only stopping point is superseded by this Uplink authorization. Remote review requires both configured CI jobs (Tests, Typecheck, Build; Android Debug APK) to pass on the latest PR commit. The PR and canonical Drive handoff will record the observed result. Captain playtest remains in progress; no merge, deployment, release or cleanup is authorized.

## PR review correction — 1 October 2026

The [required follow-up on PR #9](https://github.com/steelwater/horrox-mining/pull/9#issuecomment-5902418364) identified that a physically free drone cannot immediately dispatch when another non-waiting repair job already owns the vessel. The menu now applies that same vessel-level constraint and offers “Queue drone support.” Scheduling, save data and repair consequences are unchanged.

A regression reproduces two faults on one vessel, a dock-return repair already active, and a free drone. It failed before the fix; afterward it verifies both the queue label and the second job remaining queued without reserving the drone. All 128 tests, type checking, production build and diff whitespace checks pass. No lint script exists. This narrow label correction was verified through the actual simulation/menu functions; no new manual device pass was performed. The September 30 APK predates this correction. Fresh web and Android PR CI are required for the new head; playtesting and merge approval remain with Dan.

## Captain playtest follow-up — 1 October 2026

Authority: Dan's [new PR #9 comment](https://github.com/steelwater/horrox-mining/pull/9#issuecomment-5921617312), following acceptance of the earlier same-vessel queue-label correction. The approved scope is catch-up chronology, live versus absence-resolved requests, repair sequencing regression checks, very short reconnect suppression, count wording, and Copy Operational History. The existing branch and Uplink authorization continue; the earlier queue-label fix is preserved.

Catch-up on reload, imported-save restoration, visibility resume and delayed foreground timers now records retained operational events using their original simulated timestamps and station ages. It keeps the existing 80-message transcript limit and speaks a condensed return briefing rather than replaying expired prompts. Historical requests are labeled as absence records; autonomous decisions explain Captain unavailability. Pending requests still offer current choices and retain their original five-minute deadline. Existing transcript entries are preserved as recorded; this does not reconstruct timestamps already flattened by an older build.

The repair regression exposed a real defect: hull damage detected at cargo delivery suspended the vessel but still allowed cargo transfer in that same simulation step. Delivery now honors the hold before transfer. Separate stepped and catch-up checks verify cargo retention through dockside hull service and no extraction/delivery during simultaneous power/hull repairs. A fault discovered at extraction completion also reports cargo held for service instead of falsely claiming a return is underway. Safe return specifically for repair remains available.

Unchanged sub-minute reconnects stay quiet even when the previous full briefing is old or absent. Active warnings, pending decisions and meaningful new operations still force a briefing. A required sub-minute briefing says “less than 1 minute.” Operational load, vessel, request, drone and decision counts use singular/plural wording; request totals include vessel faults.

Copy Operational History exports every retained event oldest first, including stable ordering for simultaneous events, the existing version/milestone build label, count, station timestamp, source, repair actor, resolution, summary and optional Reason. It shares Copy Transcript's feedback and read-only selectable fallback, without advancing the simulation, changing saves or interfering with import confirmation. Existing history retention and save schema 4 remain unchanged. The development-only playtest fixture can simulate an unavailable clipboard.

Verification and remote CI results are recorded in the canonical Drive handoff and PR. No new dependency, native configuration, version/tag, merge, deployment or cleanup is part of this follow-up. Rollback is the preceding feature commit `3e6e1b7` or unchanged main `024a823`; no live save was reset. Next: First Officer review and Captain testing of the fresh PR APK, including native listening, lifecycle behavior and Bluetooth input.

Local verification: all 147 Vitest tests, type checking, production build and whitespace checks pass. No lint script exists. Regressions cover reload/visibility/delayed-timer chronology, restored transcript export without duplicate replay, still-live and expired requests, short reconnects with warnings/changes, count wording, hull delivery ordering, simultaneous critical repairs, chronological history export and clipboard success/unavailable/denied cases with import state preserved. The hull cargo test failed before the guard and passes afterward.

Manual browser verification used disposable localhost storage: a 20-minute hull-repair catch-up showed distinct 00:05 authorization, 00:07 approach, 00:08 service, 00:18 completion and 00:20 return times. Copy History reported success; the browser automation clipboard reader did not expose those bytes, so OS clipboard contents are not independently verified. With the fixture explicitly simulating an unavailable clipboard, the actual fallback displayed all nine ordered events and metadata. Inspected readable wrapping and usable controls at 390px phone and 800px tablet widths. Automated checks cover denied permission and import preservation. Physical-device listening, Bluetooth and native lifecycle checks remain Captain playtest work; CI supplies the updated Android build.

## Visible test-build identity — 1 October 2026

Dan requested an immediately recognizable version and the brief title in the existing build label. The next patch version is 0.1.1: `V0.1.1 / MILESTONE 3 - Post-Milestone 3 Operations Flow & Chatter Polish`. The footer, copied transcript and copied operational history share this label. Portable-save metadata also identifies app version 0.1.1; schema 4 is unchanged. Android versionName is aligned to 0.1.1 and versionCode advances to 2. This is a test-build identification change, not a production release/tag. The requested replacement APK and verification are recorded in the canonical Drive handoff.

## Transcript 1001 follow-up — 2 October 2026

Authority: Dan's [mobile playtest comment](https://github.com/steelwater/horrox-mining/pull/9#issuecomment-5928752157), supplied alongside the earlier Transcript 930 request and the explicit acceptance of the same-vessel queue-label fix. Those earlier changes remain accepted. The new scope is presence/timeout wording, concise pending-request reconnects, readiness-repeat intent, shared count formatting and duplicate Actor export lines.

A delayed foreground timer previously selected the absence-report path solely from elapsed time. Foreground advancement now remains live regardless of timer delay; restoration and actual visibility resume retain historical absence reporting and original event clocks. A connected timeout says no captain decision arrived within the response window and the safe operational response was applied. Safe deadlines, repair transitions and existing operational reasons remain unchanged. Newly generated connected reports do not claim an absence. Expired requests within a delayed foreground batch do not replay current choices or require a still-retained fault object.

Pending service requests now dominate reconnect briefings: count, reporter, fault, vessel, occurrence time and the channel 3 direction. Detailed choices remain in channel 3. Urgent pending repairs take priority, communications failures retain telemetry attribution, and ordinary pending crew requests direct the captain to 0. The full facility status remains available through existing commands.

The onboarding flow intentionally repeats its Autopilot explanation when the captain follows the instruction to press 0. That repeat is now labeled “Captain requested repeat” in speech/transcript, and saved readiness resumption is labeled separately. Timer ticks do not replay the prompt. The old transcript does not prove which physical key was pressed, so no historical input claim or retroactive record is invented.

A shared quantity formatter now covers readiness, operational status, reconnect duration, repair durations and history export counts. Readiness says “1 repair drone available” and uses actual availability. Copy Operational History omits Actor when identical to Source and retains a distinct Actor when present; copying still leaves the records untouched.

All 155 tests, type checking, production build and diff checks pass. New coverage exercises reconnection before the original timeout with ordinary ticks, delayed foreground ticks and another actual suspension; safe completion and exact event times; concise briefing and channel choices; urgent/telemetry reporting; explicit readiness repeats and idle ticks; zero/one/multiple counts; and duplicate/distinct actors. No lint script exists. Manual browser check on the 390px fixture confirmed a compact pending-sensor briefing and full choices only after selecting channel 3. Existing timestamp, critical-repair and clipboard regressions continue to pass.

The next distinguishable test build is V0.1.2 / MILESTONE 3 with the same brief title; Android versionName 0.1.2 / versionCode 3. Existing Android testing/setup guidance and the existing Capacitor/Gradle toolchain are reused. Physical-device lifecycle/audio, Bluetooth and install verification remain Captain checks. No new dependency, save schema, native lifecycle integration, production release, merge or cleanup was added. Rollback remains the prior V0.1.1 source commit `89ee2e8` and retained local APK. Uplink and APK checksum results are recorded in the PR and canonical Drive handoff.


## Transcript 1002 continuity follow-up — 2 October 2026

Authority: Dan's [Transcript 1002 scope decisions](https://github.com/steelwater/horrox-mining/pull/9#issuecomment-5945772508). This pass is limited to explicit readiness activation, safe routine maintenance scheduling, post-repair location continuity and preservation of simultaneous operational reports. Earlier accepted timeout wording, repair chronology, queue labels and history exports remain intact.

Readiness now starts only through the existing control, labeled **Readiness Check**. Fresh sessions remain pending. Restoration/import/backgrounding makes an active partial check pending while preserving its step; normal commands and reconnect reporting remain available. Clicking the control resumes that step, while completed/delegated checks begin a new review. No schema change is needed: pending is the existing dormant state. Backgrounding stops readiness speech, and restoring does not announce a readiness prompt. A fresh portable save now requires an explicit Readiness Check click to begin commissioning.

The existing routineServiceDue flag represents scheduled maintenance. A due flag no longer aborts safe extraction. The current extraction and cargo delivery complete before the extractor enters docked standby. Dispatch requires standby, no cargo, no active faults and an available drone; the work deadline is cleared before service. This also prevents assigning service during the scheduled unload after a dockside fault repair. The vessel remains nonproductive until service completes. Existing critical-fault safety holds still apply immediately.

Remote fault completion no longer sends every empty vessel through a synthetic delivery/return. An empty repaired extractor resumes its current run at the remote site with a fresh safe extraction duration and a location-accurate event; dockside repairs redeploy an empty vessel. Cargo or scheduled maintenance still requires the return/unload path. Both Operational History and the connected transcript retain the resumption event. Physical travel, service and drone-turnaround timestamps retain the common event clock.

Connected reporting now retains every non-chatter event within the existing transcript retention limit instead of selecting only the final ordinary event or excluding ordinary events when repair events coexist. Consecutive related routine events sharing a timestamp, such as delivery and service assignment, retain their individual transcript records and are spoken as one combined announcement. Repair requests and safety events retain their own reporting path.

Chatter policy is unchanged: context gating and finite station-time cooldowns protect against mechanical short loops; there is no blanket once-per-session rule. Broader dialogue volume and personality recurrence remain deferred.

Verification: 162 tests, type checking, production build, Capacitor sync and diff checks pass; no lint script exists. Added coverage exercises initial/restored/imported/backgrounded readiness, explicit resumption, normal status while dormant, maintenance due during extraction and delivery, dockside retained-cargo unload before service, no productive work during maintenance, stable/dense remote resumption, and simultaneous delivery/service speech plus transcript. Stepped and catch-up maintenance states agree. Browser verification on an isolated localhost origin confirmed fresh dormant readiness, explicit start, partial progress, reload without reactivation, normal key-0 status and explicit resumption at the saved step. Native listening, physical-device lifecycle, Bluetooth and iOS runtime remain Captain checks.

Test build: V0.1.3 / MILESTONE 3 - Post-Milestone 3 Operations Flow & Chatter Polish; Android versionName 0.1.3 / versionCode 4. Existing Android testing/setup inventory and Capacitor/Gradle toolchain are reused; no new dependency, migration or release workflow is introduced. Rollback remains source commit bc94fde and the retained V0.1.2 APK. Uplink, CI and artifact checksum evidence are recorded in the PR and canonical Drive handoff. No merge, deployment, release or cleanup is included.
