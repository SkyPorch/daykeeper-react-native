export type DaykeeperReactNativeTransportErrorCode =
  | "INVALID_CONFIGURATION"
  | "TOKEN_PROVIDER_ERROR"
  | "NETWORK_ERROR"
  | "REQUEST_ABORTED"
  | "REQUEST_TIMEOUT"
  | "INVALID_RESPONSE"
  | "RESPONSE_TOO_LARGE";

// Error bodies are untrusted, so a code is only allowed through when its
// *shape* proves it is a code and not prose, a token, or an identifier: ASCII
// lowercase snake_case, 3 to 64 characters. The gateway's error vocabulary is
// open and grows without an SDK release, so an allowlist would silently
// collapse codes that consuming apps switch on. Anything failing the shape --
// free-form English messages, mixed case, punctuation, whitespace, non-string
// values -- is replaced with the generic code below. Message projection is
// unchanged: the error message is the code itself, never raw body text.
const API_CODE_SHAPE = /^[a-z][a-z0-9_]{2,63}$/;

export const DAYKEEPER_GENERIC_API_CODE = "daykeeper_request_failed";

/** True when `value` has the documented customer API error-code shape. */
export function isDaykeeperApiErrorCode(value: unknown): value is string {
  return typeof value === "string" && API_CODE_SHAPE.test(value);
}

/**
 * Contract-documented next steps. The envelope is open and its values are
 * extensible, so an unrecognized hint is dropped rather than surfaced: a
 * gateway string is untrusted and none of these grant account authority.
 *
 * This is deliberately narrower than the error-code rule above. A code is only
 * ever compared by the app, so an unknown one is inert; a next action is a UI
 * instruction the app acts on, so only the three the contract defines are
 * allowed through.
 */
export type DaykeeperReactNativeNextAction =
  "review_usage" | "review_setup" | "refresh_conversation";

const SAFE_NEXT_ACTIONS = new Set<string>([
  "review_usage",
  "review_setup",
  "refresh_conversation",
]);

export class DaykeeperReactNativeApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly outcomeUnknown: boolean;
  readonly nextAction?: DaykeeperReactNativeNextAction;

  constructor(options: {
    status: number;
    code?: unknown;
    nextAction?: unknown;
    retryable?: boolean;
    outcomeUnknown?: boolean;
  }) {
    const code = isDaykeeperApiErrorCode(options.code)
      ? options.code
      : DAYKEEPER_GENERIC_API_CODE;
    super(code);
    this.name = "DaykeeperReactNativeApiError";
    this.status = options.status;
    this.code = code;
    this.outcomeUnknown = options.outcomeUnknown ?? false;
    this.retryable = !this.outcomeUnknown && (options.retryable ?? false);
    if (
      typeof options.nextAction === "string" &&
      SAFE_NEXT_ACTIONS.has(options.nextAction)
    ) {
      this.nextAction = options.nextAction as DaykeeperReactNativeNextAction;
    }
  }

  toJSON(): {
    name: string;
    status: number;
    code: string;
    retryable: boolean;
    outcomeUnknown: boolean;
    nextAction?: DaykeeperReactNativeNextAction;
  } {
    return {
      name: this.name,
      status: this.status,
      code: this.code,
      retryable: this.retryable,
      outcomeUnknown: this.outcomeUnknown,
      ...(this.nextAction === undefined ? {} : { nextAction: this.nextAction }),
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
