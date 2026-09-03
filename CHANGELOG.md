# Changelog

## 0.2.0 (unreleased)

The unreleased candidate that began as `0.1.1` was renamed `0.2.0` for the
native transport break. `0.1.0` remains the published baseline; `package.json`
is not bumped by these entries.

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
- Re-vendor the customer contract from `daykeeper-openapi` commit `4a2b82c`,
  where `CustomerError` is `additionalProperties: true` and the `error` code is
  documented as extensible.

- Set `cache: "no-store"` on every dispatch. Native exports also send
  `Cache-Control: no-cache, no-store` for transports that ignore Fetch cache mode.
  Keep browser cache headers under standard Fetch control to avoid changing CORS.
- Add seeded-cache account-switch, revoked-credential, freshness and no-new-storage
  probes against real HTTP, with mandatory native positive cache controls.

- Breaking native setup change: configure a Fetch transport explicitly. The
  native export no longer silently falls back to React Native's XHR-based Fetch.
  On the validated Expo 57 runtime, import `fetch` from `expo/fetch` and supply
  it as the client `fetch` option. Bare native transports must enforce the same
  redirect rejection and cookie omission contract; Expo is not a dependency.
- Set `redirect: "error"` and `credentials: "omit"` on every SDK request,
  including credential refresh. Node/web standard Fetch remains the default.
- Verify native and Node ESM/CJS exports, declarations and installed-package
  policy behavior independently. Android/release certification remains open.

The following changes were developed in the unpublished `0.1.1` candidate and
are included here; `0.1.0` remains the published baseline until release approval.

- Never replay writes after authentication failure; classify uncertain write
  outcomes explicitly and make all write errors non-retryable.
- Honor first-read HTTP 401 `retryable: false` before credential refresh, within
  the original deadline and response size limit.
- Allowlist safe API error codes; redact unknown codes from messages, stacks,
  and serialization. Treat failed native body reads as transport failures.
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

## 0.1.0

- Add typed customer identity, conversation, message, unread, and seen APIs.
- Add safe anonymous-thread claiming after sign-in.
- Support both streaming Fetch responses and React Native's buffered
  `Response.text()` behavior with bounded UTF-8 response validation.
- Add explicit React Native package exports, rotating tokens, request timeouts,
  and stable customer-safe errors.
- Preserve reverse-proxy path prefixes and retry exactly once with a forced
  token refresh after an HTTP 401 response.
