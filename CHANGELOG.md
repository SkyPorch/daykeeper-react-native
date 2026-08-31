# Changelog

## 0.2.0 (unreleased)

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
