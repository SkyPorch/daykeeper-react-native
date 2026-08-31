# Daykeeper native network boundary fixture

This is a diagnostic release gate, not a production transport fix. It compares
the packed SDK with default Fetch and a wrapper that passes `redirect: "error"`
and `credentials: "omit"`. A second loopback listener records redirected
requests, including arrivals whose bodies never finish. No real credentials,
messages, backend services or accounts are used.

Run `pnpm build && pnpm smoke:package`. A cold-cache offline consumer installs the
tarball, verifies both exports, then runs the existing replay matrix and 224 new
boundary cases across ESM/CJS and default/strict Node transports. Each transport
has five direct API controls, 50 redirect cases and one cookie case. Node lacks
an ambient cookie jar, so its cookie result is explicitly not native evidence.
Full receipts and the artifact checksum are in `.smoke/latest-package.json`.

For native tests, follow the dedicated development-host and installed-tarball
resolution instructions in [the replay fixture](../replay/README.md), mounting
this directory's `native.js` instead. The host must already have Expo installed;
the test SDK itself gains no Expo dependency. Start
`node smoke/boundary/server.mjs`; it listens only on `127.0.0.1:18246` and
`127.0.0.1:18247`. On a dedicated authorized Android emulator, reverse both
ports explicitly with `adb -s <dedicated-device> reverse tcp:<port> tcp:<port>`.
Route the host's Metro port separately. Never target the default or a signed-in
device. Do not disable OS security protections to make a test run.

Press `daykeeper-run` once. The native fixture compares the captured ambient
Fetch, the explicit XHR-backed `whatwg-fetch` export, that export with strict
options, and explicit `expo/fetch` with strict options. It records whether the
ambient Fetch matches either implementation; do not infer that from the host's
Expo version. Results are at `http://127.0.0.1:18246/results`. Success means all
224 cases were recorded and Expo strict rejected every redirect with no sink
arrival, while all five direct controls and the seeded-cookie control worked.
Baseline XHR redirects can time out waiting for a body; allow several minutes
for the diagnostic matrix. This does not make XHR safe.

The receiver stores only synthetic case IDs, counts, HTTP methods and presence
flags/byte counts, never token or message values. Cookies are synthetic, expire
after five minutes, and are cleared in `finally`. Fixture control reads have a
five-second bound; SDK calls use their own five-second lifetime. The matrix
re-reads receipts at the end to detect late arrivals. Each run identifier is
single-use: restart the server and cold-start the isolated fixture for a rerun.
Stop only your owned test listeners/client when done.

This does not certify HTTPS downgrade handling, redirects with ambient cookies,
Android runtime behavior, release builds, a full messenger, account isolation,
or production-droplet parity. Transport enforcement and consumer migration are
follow-up work; do not present this probe as the fix.

Primary implementation references: [React Native networking](https://reactnative.dev/docs/network)
and [Expo Fetch](https://docs.expo.dev/versions/latest/sdk/expo/#expofetch-api).
Behavior is measured directly rather than inferred from documentation alone.

## Recorded iOS evidence

On 2026-08-31 the installed candidate with SHA-256
`6982ecae9e963b362a4f02acb7a8506eb996906e507d9333f94400e7d4703350`
completed all 224 cases on iOS 26.5, React Native 0.86.2, React 19.2.3 and Hermes
in a dedicated Expo 57 development host. The captured ambient Fetch matched
the XHR implementation, not Expo Fetch. All direct API controls succeeded.

| Transport                      | Redirect arrivals / 50 | Network rejections | Timeouts | Seeded cookie sent |
| ------------------------------ | ---------------------: | -----------------: | -------: | ------------------ |
| Captured ambient               |                     42 |                  0 |        8 | Yes                |
| Explicit XHR                   |                     42 |                  0 |        8 | Yes                |
| XHR with strict options        |                     42 |                  0 |        8 | No                 |
| Expo Fetch with strict options |                      0 |                 50 |        0 | No                 |

Every cookie-positive control confirmed the cookie was stored before omission
was tested. The eight XHR timeouts were message/claim POSTs under 307/308 across
both destinations; no sink arrival was observed for those cases. No redirected
body or authorization header was observed on this iOS run. That is not a promise
of safety on other native transports: Node's default Fetch forwarded bodies in
eight cases and authorization in 25 same-origin cases. The strict Node wrapper
blocked all 50 redirects for both installed module formats.

The first native run completed its SDK matrix but the Maestro status check lost
its driver connection. The final run, with arrival-before-body accounting and
bounded control reads, passed both the 224-case receipt and the Maestro flow.
The receiver's partial-body instrumentation also has an independent Node test.
iOS and Android fixture bundles compiled; Android device execution still awaits
authorization on a fresh emulator. Neither a bundle build nor these iOS results
certify Android, production deployment, or the actual app's startup path.
