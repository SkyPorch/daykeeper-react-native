# Changelog

## 0.2.0 — 2026-09-21

This version introduces the native transport break described below. The
pre-release candidate was renumbered from `0.1.1` to `0.2.0`; `0.1.1` was never
released, so every change below is relative to the published `0.1.0`.

### Security

`0.1.0` is no longer supported. Upgrade to `0.2.0`.

- `0.1.0` set no redirect policy. On React Native's default XHR-backed Fetch a
  redirected request, including its bearer token, could be followed to another
  endpoint. `0.2.0` sends `redirect: "error"`, `credentials: "omit"` and
  `cache: "no-store"` on every request, and the native export refuses to run
  without an explicitly supplied compliant Fetch transport.
- `0.1.0` replayed every request once after an HTTP 401, including writes, so
  a message or conversation could be created twice. `0.2.0` never replays a
  write; only reads refresh credentials and retry once.

### Breaking

- **Native transport must be configured explicitly.** The native export no
  longer falls back to React Native's XHR-based Fetch. Callers must supply a
  `fetch` implementation that rejects redirects and omits ambient cookies; on
  the validated Expo 57 runtime, `fetch` from `expo/fetch`. A client
  constructed without one now fails before credentials are requested.
- **Server error codes must look like codes.** `0.1.0` copied any string
  `error` value into `DaykeeperReactNativeApiError.code`. `0.2.0` passes a value
  through unchanged only when it matches `^[a-z][a-z0-9_]{2,63}$`, including
  codes newer than the installed SDK; anything else, such as a free-form English
  sentence, becomes `daykeeper_request_failed`. The vocabulary stays open, so
  handle unknown codes safely. (An unreleased candidate briefly used a 23-entry
  allowlist; it never shipped.)
- **Writes are never replayed after HTTP 401.** A write rejected with 401 now
  throws `DaykeeperReactNativeApiError` with status 401 and `retryable: false`.
  The token provider receives `forceRefresh: true` only for a read. Refresh the
  session and let the customer send again.
- **Token provider failures are wrapped.** An error thrown by `getAccessToken`
  now surfaces as `DaykeeperReactNativeTransportError` with code
  `TOKEN_PROVIDER_ERROR` and `retryable: false`, not as the original error.
  Apps that inspected their own provider errors must track that state
  themselves.
- **Write errors are never retryable, and uncertain outcomes are explicit.**
  Every write error now has `retryable: false` (`0.1.0` marked 408, 429 and 5xx
  retryable). A write that failed after dispatch, or returned 408 or 5xx, also
  has `outcomeUnknown: true`. Reconcile server state before a deliberate new
  write.

This package consumes the **customer** contract only, which remains 0.1.0. The
newly required `Idempotency-Key` header on flow mutations, and the `200`
returned alongside `201` for a replayed mutation, are **management** contract
0.2.0 changes and do not apply here. The breaking changes above are this
package's own. See [`COMPATIBILITY.md`](COMPATIBILITY.md).

### Changes

- Preserve the API-only inbox contract: widget identity and anonymous-thread
  claim return `409 widget_unavailable` before contacting the provider.
- Preserve every server error code whose shape is a code. Codes matching
  `^[a-z][a-z0-9_]{2,63}$` pass through unchanged; only values that fail that
  shape collapse to `daykeeper_request_failed`. The previous 23-entry
  allowlist collapsed live gateway codes the consuming app switches on, such
  as `support_gateway_request_failed`, `widget_token_required`,
  `invalid_tenant` and `conversation_not_found`. Message projection is
  unchanged: no raw body text enters the message, stack or serialization.
- Decide on the HTTP status before parsing an error body. An HTML error page
  from a proxy or CDN no longer discards the status as `INVALID_RESPONSE`, and
  a non-JSON 401 still authorizes the single credential refresh on reads.
- Accept `http://[::1]` and other bracketed IPv6 loopback base URLs for local
  development. The loopback check compared against an unbracketed `::1` and
  never matched.
- Expose `DaykeeperReactNativeApiError.nextAction`, projected through a closed
  allowlist of `review_usage`, `review_setup` and `refresh_conversation` and
  included in `toJSON` when present. Unrecognized values become `undefined`.
  The contract's `message` field remains unread.
- Verify the vendored contract's provenance in `check:generated`. The new
  `scripts/check-generated.mjs` recomputes the SHA-256 and Git blob id of
  `openapi/customer.yaml`, requires both plus the upstream commit to appear in
  `openapi/SOURCE.md`, and regenerates types into a temporary directory, so a
  contract edit can no longer pass by regenerating alongside it.
- Vendor the customer contract from immutable `daykeeper-openapi` tag
  `v1.1.0` (commit `c9a0175`), where `CustomerError` is
  `additionalProperties: true` and the `error` code is documented as extensible.

- Set `cache: "no-store"` on every dispatch. Native exports also send
  `Cache-Control: no-cache, no-store` for transports that ignore Fetch cache mode.
  Keep browser cache headers under standard Fetch control to avoid changing CORS.
- Add seeded-cache account-switch, revoked-credential, freshness and no-new-storage
  probes against real HTTP, with mandatory native positive cache controls.

- Set `redirect: "error"` and `credentials: "omit"` on every SDK request,
  including credential refresh. Node/web standard Fetch remains the default.
- Verify native and Node ESM/CJS exports, declarations and installed-package
  policy behavior independently. Android/release certification remains open.

The following changes were developed in the candidate previously numbered
`0.1.1` and ship as part of `0.2.0`; `0.1.0` remains the published baseline
until release approval.

- Never replay writes after authentication failure; classify uncertain write
  outcomes explicitly and make all write errors non-retryable.
- Honor first-read HTTP 401 `retryable: false` before credential refresh, within
  the original deadline and response size limit.
- Keep raw error bodies out of messages, stacks and serialization. Treat
  failed native body reads as transport failures.
- Respect explicit server retry advice for customer API errors, including
  non-retryable quota ceilings; preserve older status-only read classification.
- Align vendored OpenAPI license metadata and record the exact source commit
  and checksum; generated types and runtime behavior are unchanged.
- Classify credential-provider failures as non-retryable `TOKEN_PROVIDER_ERROR`
  without exposing raw provider errors; timeout and cancellation stay distinct.
- Bound credential acquisition, authentication refresh, transport, and buffered
  or streaming response reads by one cancellable request deadline.
- Prevent late dispatch, release failed response bodies without waiting for
  cleanup, and sanitize credential-provider failures.
- Make public SDK and generated contract documentation
  infrastructure-provider neutral.
- Ship a `NOTICE` file recording the Apache-2.0 contract the generated types
  come from, with the full Apache-2.0 text as `LICENSE-APACHE-2.0`, and list
  supported versions and a private reporting channel in `SECURITY.md`.

## 0.1.0

- Add typed customer identity, conversation, message, unread, and seen APIs.
- Add safe anonymous-thread claiming after sign-in.
- Support both streaming Fetch responses and React Native's buffered
  `Response.text()` behavior with bounded UTF-8 response validation.
- Add explicit React Native package exports, rotating tokens, request timeouts,
  and stable customer-safe errors.
- Preserve reverse-proxy path prefixes and retry exactly once with a forced
  token refresh after an HTTP 401 response.
