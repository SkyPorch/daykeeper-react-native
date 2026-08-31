export type DaykeeperReactNativeTransportErrorCode =
  | "INVALID_CONFIGURATION"
  | "TOKEN_PROVIDER_ERROR"
  | "NETWORK_ERROR"
  | "REQUEST_ABORTED"
  | "REQUEST_TIMEOUT"
  | "INVALID_RESPONSE"
  | "RESPONSE_TOO_LARGE";

// Error bodies are untrusted. Even a token-shaped string can contain private
// data, so only documented codes may enter messages, stacks, or serialization.
const SAFE_API_CODES = new Set([
  "missing_bearer_token",
  "invalid_bearer_token",
  "invalid_token",
  "unsupported_token",
  "invalid_signature",
  "invalid_tenant",
  "unknown_tenant",
  "invalid_issuer",
  "invalid_audience",
  "invalid_subject",
  "invalid_expiration",
  "expired_token",
  "token_lifetime_too_long",
  "insufficient_scope",
  "not_found",
  "rate_limited",
  "support_upstream_rejected",
  "support_upstream_unavailable",
  "daykeeper_usage_limit_exceeded",
  "daykeeper_usage_not_enabled",
  "daykeeper_support_not_ready",
  "daykeeper_resource_conflict",
  "daykeeper_support_unavailable",
]);

export class DaykeeperReactNativeApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly outcomeUnknown: boolean;

  constructor(options: {
    status: number;
    code?: unknown;
    retryable?: boolean;
    outcomeUnknown?: boolean;
  }) {
    const code =
      typeof options.code === "string" && SAFE_API_CODES.has(options.code)
        ? options.code
        : "daykeeper_request_failed";
    super(code);
    this.name = "DaykeeperReactNativeApiError";
    this.status = options.status;
    this.code = code;
    this.outcomeUnknown = options.outcomeUnknown ?? false;
    this.retryable = !this.outcomeUnknown && (options.retryable ?? false);
  }

  toJSON(): {
    name: string;
    status: number;
    code: string;
    retryable: boolean;
    outcomeUnknown: boolean;
  } {
    return {
      name: this.name,
      status: this.status,
      code: this.code,
      retryable: this.retryable,
      outcomeUnknown: this.outcomeUnknown,
    };
  }
}

export class DaykeeperReactNativeTransportError extends Error {
  readonly code: DaykeeperReactNativeTransportErrorCode;
  readonly retryable: boolean;
  readonly outcomeUnknown: boolean;

  constructor(options: {
    code: DaykeeperReactNativeTransportErrorCode;
    message: string;
    retryable?: boolean;
    outcomeUnknown?: boolean;
  }) {
    super(options.message);
    this.name = "DaykeeperReactNativeTransportError";
    this.code = options.code;
    this.outcomeUnknown = options.outcomeUnknown ?? false;
    this.retryable = !this.outcomeUnknown && (options.retryable ?? false);
  }

  toJSON(): {
    name: string;
    code: DaykeeperReactNativeTransportErrorCode;
    message: string;
    retryable: boolean;
    outcomeUnknown: boolean;
  } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      outcomeUnknown: this.outcomeUnknown,
    };
  }
}
