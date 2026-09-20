# Native HTTP cache isolation

The API already returns `Cache-Control: no-store`. This fixture deliberately
returns public/private cacheable responses without `Vary` to verify an additional
client boundary. Use only a dedicated, data-free development host and loopback.
It never needs a real account, token, product entrypoint or network service.

`pnpm check` runs unit safeguards and the packed Node/native ESM/CJS probes.
Node's Fetch has no persistent HTTP cache: its passing wire-policy checks do not
certify native cache isolation.

For native validation, choose unused loopback ports for both Metro and the cache
server. Verify the app process belongs to the intended data-free simulator and
that no other client connects; a saved developer URL can reconnect automatically.
Retire the test listeners afterward. Reused ports are not evidence of isolation.

Start `node smoke/cache/server.mjs <cache-port>`. Mount
`runCacheCases` from `cases.js` in a development-only native host, passing the
actual installed tarball client factory and the host's unwrapped `expo/fetch`
as `transport`. The factory must pass that same Fetch explicitly to the SDK.
Set `origin` to that loopback port, a unique short `run`, `requireCache: true`,
and `nativeHeaders: true`. Post the returned report to `/result`; GET `/results`
returns reports. No device proxy, HTTPS exception or cookie settings are changed.

Every identity, conversation-list, message-list and unread read is checked
against public, private and no-store response policies. For cacheable responses,
the native run must first observe a real cache hit. It then switches A → B → A,
checks repeated-read freshness and confirms revoked credentials get HTTP 403,
not cached success. A separate cold URL checks that a protected response was
not newly stored. Server receipts verify identities, request counts and native
cache directives; zero network activity is never considered a passing safeguard.

A consumer can pass its actual client factory with no transport override and
select its supported `operations`. Keep the raw control Fetch separate from the
hardened consumer transport so positive cache controls remain meaningful.
The fixture retains only synthetic subject labels and counters.

The cache mode option alone is insufficient on the inspected Expo 57 runtime:
it is not forwarded to URLSession/OkHttp. Native request directives add
revalidation and no-new-storage semantics; both are necessary because request
`no-store` alone does not invalidate a previously cached response. See
[HTTP caching semantics](https://httpwg.org/specs/rfc9111.html#cache-request-directive)
and [standard Fetch cache mode](https://fetch.spec.whatwg.org/#concept-request-cache-mode).
An injected transport remains trusted to honor the contract. These tests do not
certify hostile proxies, browser service workers, Android, release builds or
application-level persistence/account-switch UI behavior.

## Recorded native run

Candidate tarball SHA256
`eaf9ad2da540902230deeb8485bbd505a0e8b227792db5902f2130d2e53d5f54`
passed all 24 SDK cache cases with eight required cache-hit controls on
iOS 26.5 / React Native 0.86.2 / Hermes / Expo 57.0.15. The preceding SDK candidate
reproduced cross-account cache reuse under the same synthetic cacheable policy.
The hardened artifact also passed the 56 native redirect/cookie cases and 60
replay/cancellation/body-limit cases. Two early runs without every positive cache
control were not credited; the fixture now leaves completed seeds uncanceled and
sends explicit response lengths. Bounds and required controls are unchanged.

Accepted evidence came from fresh ports with the simulator app's process and
connections verified. Earlier reused-port receipts were excluded when an
unexpected client reconnected. No production data or endpoint was tested.
