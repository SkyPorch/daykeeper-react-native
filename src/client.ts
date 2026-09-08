import {
  DaykeeperReactNativeApiError,
  DaykeeperReactNativeTransportError,
} from "./errors.js";
import type {
  DaykeeperClaimConversationResult,
  DaykeeperConversationList,
  DaykeeperConversationResult,
  DaykeeperCustomerIdentity,
  DaykeeperMessageList,
  DaykeeperMessageResult,
  DaykeeperSeenResult,
  DaykeeperUnreadSummary,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_TOKEN_LENGTH = 16_384;
const MAX_MESSAGE_LENGTH = 16_000;

// Gateway response bodies are untrusted. Only documented stable codes may
// cross the SDK boundary; arbitrary strings can contain secrets or internals.
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
  "erasure_targets_do_not_match_token",
  "unknown_campaign",
  "widget_token_required",
  "not_found",
  "support_gateway_request_failed",
  "conversation_not_found",
  "rate_limited",
  "support_upstream_rejected",
  "support_upstream_unavailable",
  "widget_unavailable",
  "daykeeper_usage_limit_exceeded",
  "daykeeper_usage_not_enabled",
  "daykeeper_support_not_ready",
  "daykeeper_resource_conflict",
  "daykeeper_support_unavailable",
]);

export interface DaykeeperReactNativeTokenProviderContext {
  /**
   * True only after Daykeeper rejected the first token with HTTP 401. The
   * provider should bypass any token cache and exchange the app session again.
   */
  forceRefresh: boolean;
}

export type DaykeeperReactNativeTokenProvider = (
  context: DaykeeperReactNativeTokenProviderContext,
) => string | Promise<string>;

export interface DaykeeperReactNativeClientOptions {
  baseUrl: string;
  getAccessToken: DaykeeperReactNativeTokenProvider;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

export interface DaykeeperReactNativeRequestOptions {
  signal?: AbortSignal;
}

export class DaykeeperReactNativeClient {
  readonly #baseUrl: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #getAccessToken: DaykeeperReactNativeTokenProvider;
  readonly #timeoutMs: number;

  constructor(options: DaykeeperReactNativeClientOptions) {
    this.#baseUrl = parseBaseUrl(options.baseUrl);
    this.#fetch = options.fetch ?? globalThis.fetch;
    if (typeof this.#fetch !== "function") {
      throw configurationError("A Fetch API implementation is required");
    }
    if (typeof options.getAccessToken !== "function") {
      throw configurationError("getAccessToken must be a function");
    }
    this.#getAccessToken = options.getAccessToken;
    this.#timeoutMs = validateTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  getIdentity(
    options?: DaykeeperReactNativeRequestOptions,
  ): Promise<DaykeeperCustomerIdentity> {
    return this.#request("/v1/identity", { signal: options?.signal });
  }

  listConversations(
    options?: DaykeeperReactNativeRequestOptions,
  ): Promise<DaykeeperConversationList> {
    return this.#request("/v1/conversations", { signal: options?.signal });
  }

  createConversation(
    options?: DaykeeperReactNativeRequestOptions,
  ): Promise<DaykeeperConversationResult> {
    return this.#request("/v1/conversations", {
      method: "POST",
      signal: options?.signal,
    });
  }

  getUnread(
    options?: DaykeeperReactNativeRequestOptions,
  ): Promise<DaykeeperUnreadSummary> {
    return this.#request("/v1/unread", { signal: options?.signal });
  }

  markConversationSeen(
    conversationId: number,
    options?: DaykeeperReactNativeRequestOptions,
  ): Promise<DaykeeperSeenResult> {
    return this.#request(
      `/v1/conversations/${positiveInteger(conversationId, "conversationId")}/seen`,
      { method: "POST", signal: options?.signal },
    );
  }

  listMessages(
    conversationId: number,
    options: DaykeeperReactNativeRequestOptions & { after?: number } = {},
  ): Promise<DaykeeperMessageList> {
    const id = positiveInteger(conversationId, "conversationId");
    const after =
      options.after === undefined
        ? ""
        : `?after=${positiveInteger(options.after, "after")}`;
    return this.#request(`/v1/conversations/${id}/messages${after}`, {
      signal: options.signal,
    });
  }

  sendMessage(
    conversationId: number,
    content: string,
    options?: DaykeeperReactNativeRequestOptions,
  ): Promise<DaykeeperMessageResult> {
    const normalizedContent = validateMessage(content);
    return this.#request(
      `/v1/conversations/${positiveInteger(conversationId, "conversationId")}/messages`,
      {
        method: "POST",
        body: { content: normalizedContent },
        signal: options?.signal,
      },
    );
  }

  claimAnonymousConversation(
    widgetToken: string,
    options?: DaykeeperReactNativeRequestOptions,
  ): Promise<DaykeeperClaimConversationResult> {
    if (
      typeof widgetToken !== "string" ||
      !widgetToken.trim() ||
      widgetToken.length > MAX_TOKEN_LENGTH
    ) {
      throw configurationError("widgetToken is invalid");
    }
    return this.#request("/v1/anonymous-conversations/claim", {
      method: "POST",
      body: { widgetToken: widgetToken.trim() },
      signal: options?.signal,
    });
  }

  async #request<ResponseBody>(
    path: string,
    options: {
      method?: "GET" | "POST";
      body?: unknown;
      signal?: AbortSignal;
    } = {},
  ): Promise<ResponseBody> {
    const timeoutController = new AbortController();
    let stopReason: "timeout" | "caller" | undefined;
    let activeResponse: Response | undefined;
    const cancelActiveBody = () => {
      try {
        void activeResponse?.body?.cancel().catch(() => {});
      } catch {
        // Body cleanup is best-effort and must never mask the request outcome.
      }
    };
    let rejectLifetime: (reason: unknown) => void = () => {};
    const lifetime = new Promise<never>((_, reject) => {
      rejectLifetime = reject;
    });
    // A pre-aborted request may never race this promise; absorb its terminal
    // rejection so synchronous cancellation cannot create unhandled activity.
    void lifetime.catch(() => {});
    const timeout = setTimeout(() => {
      if (stopReason) return;
      stopReason = "timeout";
      timeoutController.abort();
      cancelActiveBody();
      rejectLifetime(
        new DaykeeperReactNativeTransportError({
          code: "REQUEST_TIMEOUT",
          message: `The Daykeeper request exceeded ${this.#timeoutMs}ms`,
          retryable: true,
        }),
      );
    }, this.#timeoutMs);
    const onCallerAbort = () => {
      if (stopReason) return;
      stopReason = "caller";
      timeoutController.abort();
      cancelActiveBody();
      rejectLifetime(
        new DaykeeperReactNativeTransportError({
          code: "REQUEST_ABORTED",
          message: "The Daykeeper request was aborted",
        }),
      );
    };
    const mutating = options.method === "POST";
    let dispatched = false;
    if (options.signal?.aborted) onCallerAbort();
    else
      options.signal?.addEventListener("abort", onCallerAbort, { once: true });

    try {
      for (let attempt = 0; attempt < (mutating ? 1 : 2); attempt += 1) {
        if (stopReason) {
          throw new DaykeeperReactNativeTransportError({
            code:
              stopReason === "timeout" ? "REQUEST_TIMEOUT" : "REQUEST_ABORTED",
            message:
              stopReason === "timeout"
                ? `The Daykeeper request exceeded ${this.#timeoutMs}ms`
                : "The Daykeeper request was aborted",
          });
        }
        const token = validateToken(
          await Promise.race([
            Promise.resolve().then(() =>
              this.#getAccessToken({ forceRefresh: attempt === 1 }),
            ),
            lifetime,
          ]),
        );
        const headers = new Headers({
          accept: "application/json",
          authorization: `Bearer ${token}`,
        });
        if (options.body !== undefined) {
          headers.set("content-type", "application/json");
        }

        let response: Response;
        try {
          if (stopReason || options.signal?.aborted) {
            throw new DaykeeperReactNativeTransportError({
              code:
                stopReason === "timeout"
                  ? "REQUEST_TIMEOUT"
                  : "REQUEST_ABORTED",
              message:
                stopReason === "timeout"
                  ? `The Daykeeper request exceeded ${this.#timeoutMs}ms`
                  : "The Daykeeper request was aborted",
            });
          }
          dispatched = true;
          const fetchPromise = this.#fetch(`${this.#baseUrl}${path}`, {
            method: options.method ?? "GET",
            body:
              options.body === undefined
                ? undefined
                : JSON.stringify(options.body),
            headers,
            signal: timeoutController.signal,
          }).then((result) => {
            if (stopReason) {
              try {
                void result.body?.cancel().catch(() => {});
              } catch {
                // Late body cleanup is best-effort.
              }
            }
            return result;
          });
          response = await Promise.race([fetchPromise, lifetime]);
          activeResponse = response;
        } catch {
          if (stopReason === "timeout") {
            throw new DaykeeperReactNativeTransportError({
              code: "REQUEST_TIMEOUT",
              message: `The Daykeeper request exceeded ${this.#timeoutMs}ms`,
              retryable: true,
              outcomeUnknown: mutating && dispatched,
            });
          }
          if (options.signal?.aborted) {
            throw new DaykeeperReactNativeTransportError({
              code: "REQUEST_ABORTED",
              message: "The Daykeeper request was aborted",
              outcomeUnknown: mutating && dispatched,
            });
          }
          throw new DaykeeperReactNativeTransportError({
            code: "NETWORK_ERROR",
            message: "The Daykeeper customer API could not be reached",
            retryable: true,
            outcomeUnknown: mutating && dispatched,
          });
        }

        let payload: unknown;
        try {
          payload = await Promise.race([
            readJson(response, timeoutController.signal),
            lifetime,
          ]);
        } catch (error) {
          if (mutating && dispatched) {
            if (stopReason === "timeout") {
              throw new DaykeeperReactNativeTransportError({
                code: "REQUEST_TIMEOUT",
                message: `The Daykeeper request exceeded ${this.#timeoutMs}ms`,
                outcomeUnknown: true,
              });
            }
            if (options.signal?.aborted) {
              throw new DaykeeperReactNativeTransportError({
                code: "REQUEST_ABORTED",
                message: "The Daykeeper request was aborted",
                outcomeUnknown: true,
              });
            }
            if (error instanceof DaykeeperReactNativeTransportError) {
              throw new DaykeeperReactNativeTransportError({
                code: error.code,
                message: error.message,
                outcomeUnknown: true,
              });
            }
            throw new DaykeeperReactNativeTransportError({
              code: "INVALID_RESPONSE",
              message: "The Daykeeper customer API returned invalid JSON",
              outcomeUnknown: true,
            });
          }
          if (error instanceof DaykeeperReactNativeTransportError) throw error;
          throw new DaykeeperReactNativeTransportError({
            code: "INVALID_RESPONSE",
            message: "The Daykeeper customer API returned an invalid response",
            retryable: true,
          });
        }
        if (
          !mutating &&
          response.status === 401 &&
          attempt === 0 &&
          !(isRecord(payload) && payload.retryable === false)
        )
          continue;
        if (!response.ok) {
          const code =
            isRecord(payload) &&
            typeof payload.error === "string" &&
            SAFE_API_CODES.has(payload.error)
              ? payload.error
              : "daykeeper_request_failed";
          throw new DaykeeperReactNativeApiError({
            status: response.status,
            code,
            retryable:
              !mutating &&
              code !== "widget_unavailable" &&
              (isRecord(payload) && typeof payload.retryable === "boolean"
                ? payload.retryable
                : response.status === 408 ||
                  response.status === 429 ||
                  response.status >= 500),
            outcomeUnknown:
              mutating && (response.status === 408 || response.status >= 500),
          });
        }
        if (!isRecord(payload)) {
          throw new DaykeeperReactNativeTransportError({
            code: "INVALID_RESPONSE",
            message: "The Daykeeper customer API returned an invalid response",
            retryable: true,
            outcomeUnknown: mutating && dispatched,
          });
        }
        return payload as ResponseBody;
      }
      throw new Error("Unreachable Daykeeper request state");
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onCallerAbort);
    }
  }
}

export function createDaykeeperReactNativeClient(
  options: DaykeeperReactNativeClientOptions,
): DaykeeperReactNativeClient {
  return new DaykeeperReactNativeClient(options);
}

function parseBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw configurationError("baseUrl must be a valid absolute URL");
  }
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw configurationError(
      "baseUrl must use HTTPS except for loopback development",
    );
  }
  if (url.username || url.password || url.search || url.hash) {
    throw configurationError(
      "baseUrl cannot include credentials, a query, or a fragment",
    );
  }
  return url.toString().replace(/\/$/, "");
}

function validateTimeout(value: number): number {
  if (!Number.isInteger(value) || value < 1_000 || value > 60_000) {
    throw configurationError(
      "timeoutMs must be an integer from 1000 through 60000",
    );
  }
  return value;
}

function validateToken(value: string): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > MAX_TOKEN_LENGTH ||
    /[\r\n]/.test(value)
  ) {
    throw configurationError("The customer access token is invalid");
  }
  return value;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw configurationError(`${name} must be a positive integer`);
  }
  return value;
}

function validateMessage(value: string): string {
  if (typeof value !== "string") {
    throw configurationError("Message content must be a string");
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_MESSAGE_LENGTH) {
    throw configurationError(
      `Message content must be 1 to ${MAX_MESSAGE_LENGTH} characters`,
    );
  }
  return normalized;
}

async function readJson(
  response: Response,
  signal?: AbortSignal,
): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw responseTooLarge();
  }

  const body = response.body;
  if (
    body &&
    typeof body.getReader === "function" &&
    typeof TextDecoder === "function"
  ) {
    return parseJson(await readStream(body, signal));
  }

  let text: string;
  try {
    text = await response.text();
  } catch {
    throw invalidResponse();
  }
  if (utf8LengthExceeds(text, MAX_RESPONSE_BYTES)) {
    throw responseTooLarge();
  }
  return parseJson(text);
}

async function readStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): Promise<string> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let cancelled = false;
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    try {
      void Promise.resolve(reader.cancel()).catch(() => {});
    } catch {
      // Cleanup must not replace the bounded, sanitized request error.
    }
  };
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        cancel();
        throw responseTooLarge();
      }
      chunks.push(value);
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
    try {
      reader.releaseLock();
    } catch {
      // Cleanup must not replace the bounded, sanitized request error.
    }
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw invalidResponse();
  }
}

function utf8LengthExceeds(value: string, maximum: number): boolean {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit < 0x80) bytes += 1;
    else if (codeUnit < 0x800) bytes += 2;
    else if (
      codeUnit >= 0xd800 &&
      codeUnit <= 0xdbff &&
      index + 1 < value.length &&
      value.charCodeAt(index + 1) >= 0xdc00 &&
      value.charCodeAt(index + 1) <= 0xdfff
    ) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
    if (bytes > maximum) return true;
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function responseTooLarge(): DaykeeperReactNativeTransportError {
  return new DaykeeperReactNativeTransportError({
    code: "RESPONSE_TOO_LARGE",
    message: "The Daykeeper response exceeded 1 MiB",
  });
}

function invalidResponse(): DaykeeperReactNativeTransportError {
  return new DaykeeperReactNativeTransportError({
    code: "INVALID_RESPONSE",
    message: "The Daykeeper customer API returned invalid JSON",
    retryable: true,
  });
}

function configurationError(
  message: string,
): DaykeeperReactNativeTransportError {
  return new DaykeeperReactNativeTransportError({
    code: "INVALID_CONFIGURATION",
    message,
  });
}
