# Changelog

## Unreleased

- Make writes single-dispatch, honor explicit read retry vetoes, and mark
  dispatched write transport or ambiguous server failures as `outcomeUnknown`
  without claiming non-delivery.

- Document API-only inbox support and the `widget_unavailable` response for
  widget-specific identity and anonymous-claim operations.
- Preserve known gateway error codes while reducing unknown remote values to
  `daykeeper_request_failed`, preventing arbitrary response text from leaking
  through SDK errors.

## 0.1.0

- Add typed customer identity, conversation, message, unread, and seen APIs.
- Add safe anonymous-thread claiming after sign-in.
- Support both streaming Fetch responses and React Native's buffered
  `Response.text()` behavior with bounded UTF-8 response validation.
- Add explicit React Native package exports, rotating tokens, request timeouts,
  and stable customer-safe errors.
- Preserve reverse-proxy path prefixes and retry exactly once with a forced
  token refresh after an HTTP 401 response.
