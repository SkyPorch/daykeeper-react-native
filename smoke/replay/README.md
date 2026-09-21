# Daykeeper replay-safety fixture

`pnpm build && pnpm smoke:package` packs the SDK, installs it with its existing
runtime dependency in a cold-cache offline consumer, checks ESM/CJS declarations
and the native export condition, and runs the same 60 scenarios through all four
Node/native ESM/CJS exports using real loopback HTTP. No registry credentials, production
services, or mocked fetch are involved. Results include the tarball checksum in
`.smoke/latest-package.json`.

`cases.js` also runs unchanged inside React Native. On a dedicated, data-free
development client, mount `native.js` as the entry point and configure Metro to
resolve `@skyporch/daykeeper-react-native` to the **installed tarball** recorded
by the package smoke, not `src/` or the checkout's `dist/`. Share the host's one
React/React Native instance. Use the host's existing Babel/native setup; this
fixture does not add a native module or change the app's dependencies. The native
fixture uses the host's existing Expo 57 `expo/fetch` explicitly; it does not
silently select the XHR-backed global. Custom transports must meet the SDK's
strict redirect and cookie contract.

Start `node smoke/replay/server.mjs 18244`, then press the fixture's run button.
The fixture sends only synthetic credentials, messages and test results to
`127.0.0.1:18244`. For a dedicated Android emulator, route that loopback port
with `adb -s <dedicated-device> reverse tcp:18244 tcp:18244`. Read
`http://127.0.0.1:18244/__fixture/results` for the native receipt; success is
60 cases and 62 SDK fetch dispatches per runtime. The tested iOS transport can
retry a dropped GET internally (up to three wire attempts in that one case);
the fixture separately records wire counts and permits no extra write attempts.
Its counting wrapper delegates unchanged requests to the real runtime fetch.
Do not reuse a run identifier without
restarting the fixture server. Stop the owned fixture server and development
client afterward. Never use a signed-in device, product app entry, or retired
test credentials.

The matrix covers all four writes and a read: success, first-401 allow/deny and
legacy refresh, quota/server failures, redaction, malformed/oversized bodies,
connection loss, deadline, and cancellation after the server sees the request.
Server counters independently verify dispatch counts, methods, and path prefixes.
Native and Node use their own fetch implementation. Unit tests additionally
exercise pre-dispatch failures, uncooperative providers/readers, and byte bounds.

This fixture is transport evidence, not a full messenger, account-isolation,
push, attachment, production-droplet, or release-build certification. It does
not prove server-side idempotency or exactly-once delivery. Keep those release
gates open.

Design references: [Resend's idempotency contract](https://resend.com/docs/dashboard/emails/idempotency-keys)
for safe agent retries and [Intercom's native session lifecycle](https://developers.intercom.com/installing-intercom/react-native/using-intercom)
for app/session coordination. Daykeeper does not inherit either product's
capabilities merely by following its conventions.

Retain run-specific receipts and integration results privately.
