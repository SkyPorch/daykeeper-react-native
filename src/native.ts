import {
  DaykeeperReactNativeClient as BaseClient,
  type DaykeeperReactNativeClientOptions as BaseOptions,
} from "./client.js";
import {
  collectDeviceContext,
  DAYKEEPER_CLIENT_HEADER,
  encodeDeviceContext,
} from "./deviceContext.js";
import { DaykeeperReactNativeTransportError } from "./errors.js";
import { SDK_VERSION } from "./version.js";

export * from "./index.js";

export interface DaykeeperReactNativeClientOptions extends BaseOptions {
  /**
   * Required on native. Use explicit expo/fetch on the validated Expo runtime,
   * or a native Fetch implementation that enforces redirect:error and
   * credentials:omit and honors request Cache-Control directives. The
   * XHR-backed React Native global is not compliant.
   */
  fetch: typeof globalThis.fetch;
  /**
   * Describe this device to the gateway (app name and version, OS, device
   * model, language, time zone) so agents see it on the contact. On by
   * default on iOS and Android. No device or advertising identifier and no
   * precise location is sent. Values the host backend signs into the
   * customer session take precedence.
   */
  sendDeviceContext?: boolean;
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
    // Read once: none of it changes while the app runs. `react-native` is
    // reached lazily through reactNativeSources so this entry still loads
    // where it is absent (Node tooling, tests). A request never waits for
    // it: until the report is ready, or if it never is, requests go out
    // without it.
    let deviceContext: string | undefined;
    if (options.sendDeviceContext !== false) {
      import("./reactNativeSources.js")
        .then(({ reactNativeSources }) => {
          const sources = reactNativeSources();
          const os = sources.Platform?.OS;
          // Expo web resolves this entry too; a browser's description is the
          // web SDK's job, and an extra header would change its preflight.
          if (os !== "ios" && os !== "android") return;
          deviceContext = encodeDeviceContext(
            collectDeviceContext(sources, {
              name: "react-native",
              version: SDK_VERSION,
            }),
          );
        })
        .catch(() => undefined);
    }
    super({
      ...options,
      fetch: (input, init) => {
        // Expo 57 does not forward Fetch's cache option to URLSession/OkHttp.
        // no-cache revalidates an existing entry; no-store prevents new storage.
        // Keep this native-only so browser preflights gain no custom headers.
        const headers = new Headers(init?.headers);
        headers.set("cache-control", "no-cache, no-store");
        if (deviceContext) headers.set(DAYKEEPER_CLIENT_HEADER, deviceContext);
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
