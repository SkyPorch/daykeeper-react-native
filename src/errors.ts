export type DaykeeperReactNativeTransportErrorCode =
  | "INVALID_CONFIGURATION"
  | "NETWORK_ERROR"
  | "REQUEST_ABORTED"
  | "REQUEST_TIMEOUT"
  | "INVALID_RESPONSE"
  | "RESPONSE_TOO_LARGE";

export class DaykeeperReactNativeApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly outcomeUnknown: boolean;

  constructor(options: {
    status: number;
    code: string;
    retryable: boolean;
    outcomeUnknown?: boolean;
  }) {
    super(options.code);
    this.name = "DaykeeperReactNativeApiError";
    this.status = options.status;
    this.code = options.code;
    this.outcomeUnknown = options.outcomeUnknown ?? false;
    this.retryable = !this.outcomeUnknown && options.retryable;
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
