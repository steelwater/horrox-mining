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
