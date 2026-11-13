# Changelog

Notable changes to 1st Horrox Mining Ltd. are tracked here. Historical milestone details remain in the README and project roadmap.

## Unreleased — post-Milestone 5 reliability follow-up

- Fix a paused audio conversation blocking the finite autonomous repair-decision deadline across sleep, refresh, and reload.
- Preserve the full 15-second spoken-response window and actively playing protected-key requests.
- Add regression tests for paused repair expiry, save/reload catch-up, idempotent decisions, and long active speech.
- Device acceptance pending; do not treat this as a release.
