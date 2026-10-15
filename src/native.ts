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
   * default; nothing identifies the device or the person. Values the host
   * backend signs into the customer session take precedence.
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
    // imported lazily so this entry still loads where it is absent (Node
    // tooling, tests); there, as on any failure, no context is sent and the
    // request goes ahead regardless.
    const deviceContext =
      options.sendDeviceContext === false
        ? Promise.resolve(undefined)
        : import("react-native")
            .then((module) => {
              const reactNative = (
                module.Platform
                  ? module
                  : (module as { default?: unknown }).default
              ) as typeof module;
              return encodeDeviceContext(
                collectDeviceContext(
                  {
                    Platform: reactNative.Platform,
                    NativeModules: reactNative.NativeModules,
                    TurboModuleRegistry: reactNative.TurboModuleRegistry,
                  },
                  { name: "react-native", version: SDK_VERSION },
                ),
              );
            })
            .catch(() => undefined);
    super({
      ...options,
      fetch: async (input, init) => {
        // Expo 57 does not forward Fetch's cache option to URLSession/OkHttp.
        // no-cache revalidates an existing entry; no-store prevents new storage.
        // Keep this native-only so browser preflights gain no custom headers.
        const headers = new Headers(init?.headers);
        headers.set("cache-control", "no-cache, no-store");
        const context = await deviceContext;
        if (context) headers.set(DAYKEEPER_CLIENT_HEADER, context);
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
