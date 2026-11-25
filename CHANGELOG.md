# Changelog

Notable changes to 1st Horrox Mining Ltd. are tracked here. Historical milestone details remain in the README and project roadmap.

## Unreleased — audio-first keypad guidance (PR #13)

- Read protected repair choices with one shared touch/keyboard confirmation explanation per menu instead of repeating it for every option.
- Keep available commands and unprotected press instructions state-aware, with regression tests for protection modes, hold durations, and unavailable choices.
- Captain audio/e-paper/Bluetooth acceptance pending.

## Post-Milestone 5 repair reliability (merged PR #15)

- Fix a paused audio conversation blocking the finite autonomous repair-decision deadline across sleep, refresh, and reload.
- Preserve the full 15-second spoken-response window and actively playing protected-key requests.
- Add regression tests for paused repair expiry, save/reload catch-up, idempotent decisions, and long active speech.
- Captain confirmed safe autonomous repair completion on device; web and Android debug CI passed.
