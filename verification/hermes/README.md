# Android/Hermes runtime verification

The `React Native Hermes Android smoke` workflow builds a
temporary React Native 0.86.2 release application with the exact packed SDK.
It boots an isolated hosted Android emulator and waits for a unique success
marker rendered only after Hermes executes three SDK reads using synthetic
responses and React Native's own URL, Headers and Response implementations.
The app rejects accidental calls to global fetch. No service credentials or
live provider traffic are used. A receipt records the commit and package/APK hashes.

This is separate from Node tests and Metro bundling. Until the hosted run passes,
the harness is implementation only, not runtime evidence. It does not prove
real networking, iOS React Native runtime, messenger UI, push or attachments.

`pnpm test:hermes-harness` runs local fixture and safety tests without any
emulator or application build. Actual execution refuses local/self-hosted
runners and requires an explicit emulator serial supplied by the pinned action.
Every adb operation targets that serial, and pre-existing app installs are refused.
The workflow runs for changes to its own harness and can also be dispatched
manually. It is not a publication job or a branch-protection requirement.
