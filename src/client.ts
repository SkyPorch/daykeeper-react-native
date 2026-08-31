import {
  DaykeeperReactNativeApiError,
  DaykeeperReactNativeTransportError,
} from "./errors.js";
import {
  createRequestLifetime,
  discardResponse,
  discardReader,
} from "./requestLifetime.js";
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

export interface DaykeeperReactNativeTokenProviderContext {
  /**
   * True only after a GET rejected the first token with HTTP 401 and did not
   * explicitly forbid replay with retryable: false. The
   * provider should bypass any token cache and exchange the app session again.
   */
  forceRefresh: boolean;
  /** Cancel credential exchange when the request is aborted or expires. */
  signal?: AbortSignal;
}

export type DaykeeperReactNativeTokenProvider = (
  context: DaykeeperReactNativeTokenProviderContext,
) => string | Promise<string>;

export interface DaykeeperReactNativeClientOptions {
  baseUrl: string;
  getAccessToken: DaykeeperReactNativeTokenProvider;
  /** Must reject redirects before following and omit ambient cookies. */
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
    const lifetime = createRequestLifetime(this.#timeoutMs, options.signal);
    const method = options.method ?? "GET";
    const mutating = method !== "GET";
    const attempts = mutating ? 1 : 2;
    let dispatched = false;
    let response: Response | undefined;

    try {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const token = validateToken(
          await lifetime.run(() =>
            resolveToken(this.#getAccessToken, {
              forceRefresh: attempt === 1,
              signal: lifetime.signal,
            }),
          ),
        );
        const headers = new Headers({
          accept: "application/json",
          authorization: `Bearer ${token}`,
        });
        if (options.body !== undefined) {
          headers.set("content-type", "application/json");
        }

        try {
          response = await lifetime.run(() => {
            dispatched = true;
            return this.#fetch(`${this.#baseUrl}${path}`, {
              method,
              body:
                options.body === undefined
                  ? undefined
                  : JSON.stringify(options.body),
              headers,
              signal: lifetime.signal,
              redirect: "error",
              credentials: "omit",
            });
          }, discardResponse);
        } catch (error) {
          if (error instanceof DaykeeperReactNativeTransportError) throw error;
          throw networkError();
        }

        let payload: unknown;
        if (!mutating && response.status === 401 && attempt === 0) {
          // Read explicit denial advice within the original deadline/size bound
          // before deciding whether a credential refresh may replay this read.
          try {
            payload = await readJson(response, lifetime);
          } catch (error) {
            // A completed legacy non-JSON 401 has no structured hint. Failed,
            // stalled, oversized, or cancelled reads never authorize a replay.
            if (
              !(error instanceof DaykeeperReactNativeTransportError) ||
              error.code !== "INVALID_RESPONSE"
            )
              throw error;
          }
          if (!(isRecord(payload) && payload.retryable === false)) {
            discardResponse(response);
            continue;
          }
        } else {
          payload = await readJson(response, lifetime);
        }
        if (!response.ok) {
          throw new DaykeeperReactNativeApiError({
            status: response.status,
            code: isRecord(payload) ? payload.error : undefined,
            retryable:
              !mutating &&
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
          });
        }
        return payload as ResponseBody;
      }
      throw new Error("Unreachable Daykeeper request state");
    } catch (error) {
      if (error instanceof DaykeeperReactNativeApiError) throw error;
      const safeError =
        error instanceof DaykeeperReactNativeTransportError
          ? error
          : networkError();
      if (!mutating) throw safeError;
      throw new DaykeeperReactNativeTransportError({
        code: safeError.code,
        message: safeError.message,
        retryable: false,
        outcomeUnknown: dispatched,
      });
    } finally {
      if (response) discardResponse(response);
      lifetime.dispose();
    }
  }
}

export function createDaykeeperReactNativeClient(
  options: DaykeeperReactNativeClientOptions,
): DaykeeperReactNativeClient {
  return new DaykeeperReactNativeClient(options);
}

async function resolveToken(
  provider: DaykeeperReactNativeTokenProvider,
  context: DaykeeperReactNativeTokenProviderContext,
): Promise<string> {
  try {
    return await provider(context);
  } catch {
    throw new DaykeeperReactNativeTransportError({
      code: "TOKEN_PROVIDER_ERROR",
      message: "The Daykeeper access token could not be obtained",
    });
  }
}

function networkError(): DaykeeperReactNativeTransportError {
  return new DaykeeperReactNativeTransportError({
    code: "NETWORK_ERROR",
    message: "The Daykeeper customer API transport failed",
    retryable: true,
  });
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
  lifetime: ReturnType<typeof createRequestLifetime>,
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
    return parseJson(await readStream(body, lifetime));
  }

  let text: string;
  try {
    text = await lifetime.run(() => response.text());
  } catch (error) {
    if (error instanceof DaykeeperReactNativeTransportError) throw error;
    throw networkError();
  }
  if (utf8LengthExceeds(text, MAX_RESPONSE_BYTES)) {
    throw responseTooLarge();
  }
  return parseJson(text);
}

async function readStream(
  body: ReadableStream<Uint8Array>,
  lifetime: ReturnType<typeof createRequestLifetime>,
): Promise<string> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await lifetime.run(() => reader.read());
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        throw responseTooLarge();
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof DaykeeperReactNativeTransportError) throw error;
    throw networkError();
  } finally {
    discardReader(reader);
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
