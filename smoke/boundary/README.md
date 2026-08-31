# Daykeeper native network boundary fixture

This is a diagnostic release gate, not a production transport fix. It compares
the packed SDK with default Fetch and a wrapper that passes `redirect: "error"`
and `credentials: "omit"`. A second loopback listener records redirected
requests, including arrivals whose bodies never finish. No real credentials,
messages, backend services or accounts are used.

Run `pnpm build && pnpm smoke:package`. A cold-cache offline consumer installs the
tarball, verifies Node/native ESM/CJS exports, then runs the existing replay
matrix and 448 boundary cases across all four exports with and without an extra
caller policy wrapper. The SDK policy alone must reject every redirect. Each transport
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

## 0.2.0 enforcement candidate

The native export now requires an explicit compatible transport; Node/web
retains standard Fetch. Every SDK request sets the strict policy, including
when the diagnostic wrapper supplies no additional options. The XHR variants
remain intentional negative controls, not supported transport choices.

On 2026-08-31, installed candidate SHA-256
`e4d60af0d15e2321d99291af96ba85ca69eb8780d8097ff6c95d65ec7ef92607`
passed a combined 172-case iOS 26.5 / RN 0.86.2 / Hermes run: 56 SDK boundary cases,
56 cases through an actual downstream consumer's default Expo 57 Fetch adapter,
and all 60 replay/cancellation/body-limit cases using that transport. Both
50-redirect matrices had zero sink arrivals; confirmed ambient cookies were
omitted. Implicit native setup was rejected before token acquisition. The
consumer test omitted its fetch override, proving its native default path.

All 48 replay writes reached the server once. A dropped GET still caused three
native wire attempts from one SDK dispatch (64 total wire requests versus 62
SDK dispatches); no write retry allowance was added. A test is not server-side
exactly-once assurance. Node/native ESM/CJS exports passed 240 replay and 448
boundary cases; the native declaration/conditional-export checks also pass.
The downstream published/candidate regression matrices each passed 2,252 tests.
Android and release-build execution, first-party standalone native transport,
full-app flows and production parity remain open; no release is implied.

The same downstream native consumer passed 56 boundary cases with the exact
published 0.1.0 npm tarball (verified registry integrity, SHA-256
`b128f7bfa8dc963eeaad8ebc6008ad1ae3a4ee5f504814b111ea1dcce502fca0`). Its adapter
sets the policy even before an SDK upgrade: no redirect arrivals or ambient
cookies were observed. That older SDK still returns legacy write retry advice
without unknown-outcome metadata; the probe uses an explicit published contract
and does not mislabel it as 0.2.0 recovery behavior. Both native flows passed
Maestro. This compatibility check is not approval to ship the older recovery
contract as production-certified.
