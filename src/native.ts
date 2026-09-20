import {
  DaykeeperReactNativeClient as BaseClient,
  type DaykeeperReactNativeClientOptions as BaseOptions,
} from "./client.js";
import { DaykeeperReactNativeTransportError } from "./errors.js";

export * from "./index.js";

export interface DaykeeperReactNativeClientOptions extends BaseOptions {
  /**
   * Required on native. Use explicit expo/fetch on the validated Expo runtime,
   * or a native Fetch implementation that enforces redirect:error and
   * credentials:omit and honors request Cache-Control directives. The
   * XHR-backed React Native global is not compliant.
   */
  fetch: typeof globalThis.fetch;
}

export class DaykeeperReactNativeClient extends BaseClient {
  constructor(options: DaykeeperReactNativeClientOptions) {
    // The native conditional export must never quietly fall back to XHR Fetch.
    // A custom transport is a caller-owned trust boundary: a JS wrapper cannot
    // repair an implementation that ignores the native redirect policy.
    if (typeof options?.fetch !== "function") {
      throw new DaykeeperReactNativeTransportError({
        code: "INVALID_CONFIGURATION",
        message:
          "Native Daykeeper requires an explicit Fetch transport that rejects redirects and omits cookies",
      });
    }
    const transport = options.fetch;
    super({
      ...options,
      fetch: (input, init) => {
        // Expo 57 does not forward Fetch's cache option to URLSession/OkHttp.
        // no-cache revalidates an existing entry; no-store prevents new storage.
        // Keep this native-only so browser preflights gain no custom headers.
        const headers = new Headers(init?.headers);
        headers.set("cache-control", "no-cache, no-store");
        return transport(input, { ...init, headers });
      },
    });
  }
}

export function createDaykeeperReactNativeClient(
  options: DaykeeperReactNativeClientOptions,
): DaykeeperReactNativeClient {
  return new DaykeeperReactNativeClient(options);
}
