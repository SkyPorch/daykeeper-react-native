/**
 * What this SDK tells the Daykeeper gateway about the device it runs on, so an
 * agent sees the app, app version, device and OS on the contact without the
 * host app writing any code (the way Intercom's SDKs do).
 *
 * Everything comes from the platform's own APIs. React Native's `Platform`
 * answers OS, version and (on Android) brand and model. App name, version,
 * build and identifier, and the iOS device model, come from Expo's
 * `expo-application`/`expo-device` or `react-native-device-info` when the host
 * already has them; the SDK adds no native dependency of its own. A value
 * nothing can answer is left out. No device identifier, advertising ID or
 * location is ever read.
 *
 * Collection never throws: a support thread must not break because a device
 * could not describe itself.
 */

export const DAYKEEPER_CLIENT_HEADER = "daykeeper-client";

export interface DaykeeperDeviceContext {
  sdk: string;
  sdkVersion: string;
  platform?: "ios" | "android" | "web";
  osName?: string;
  osVersion?: string;
  deviceBrand?: string;
  deviceModel?: string;
  appName?: string;
  appId?: string;
  appVersion?: string;
  appBuild?: string;
  locale?: string;
  timeZone?: string;
}

/** The slice of `react-native` this module reads, injectable for tests. */
export interface ReactNativeDeviceSources {
  Platform: { OS: string; Version?: unknown; constants?: unknown };
  NativeModules?: Record<string, unknown>;
  TurboModuleRegistry?: { get?: (name: string) => unknown };
}

type Bag = Record<string, unknown>;

const record = (value: unknown): Bag | undefined =>
  value && typeof value === "object" ? (value as Bag) : undefined;

const text = (value: unknown): string | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= 100 ? trimmed : undefined;
};

const first = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    const found = text(value);
    if (found) return found;
  }
  return undefined;
};

/** An Expo module's constants: Expo Modules expose them as properties. */
const expoModule = (name: string): Bag | undefined =>
  record(record(record(globalThis as unknown)?.expo)?.modules)?.[name] as
    Bag | undefined;

/** `react-native-device-info`'s constants, on either architecture. */
const deviceInfoConstants = (sources: ReactNativeDeviceSources): Bag => {
  const module = record(
    sources.NativeModules?.RNDeviceInfo ??
      sources.TurboModuleRegistry?.get?.("RNDeviceInfo"),
  );
  const getConstants = module?.getConstants;
  try {
    return (
      record(
        typeof getConstants === "function"
          ? getConstants.call(module)
          : undefined,
      ) ??
      module ??
      {}
    );
  } catch {
    return {};
  }
};

const intlContext = (): Pick<DaykeeperDeviceContext, "locale" | "timeZone"> => {
  try {
    const options = new Intl.DateTimeFormat().resolvedOptions();
    return {
      ...(text(options.locale) ? { locale: options.locale } : {}),
      ...(text(options.timeZone) ? { timeZone: options.timeZone } : {}),
    };
  } catch {
    return {};
  }
};

export function collectDeviceContext(
  sources: ReactNativeDeviceSources,
  sdk: { name: string; version: string },
): DaykeeperDeviceContext {
  const context: DaykeeperDeviceContext = {
    sdk: sdk.name,
    sdkVersion: sdk.version,
  };
  try {
    const os = sources.Platform?.OS;
    const constants = record(sources.Platform?.constants) ?? {};
    const application = expoModule("ExpoApplication") ?? {};
    const device = expoModule("ExpoDevice") ?? {};
    const deviceInfo = deviceInfoConstants(sources);

    const values: Omit<DaykeeperDeviceContext, "sdk" | "sdkVersion"> = {
      platform:
        os === "ios" || os === "android" || os === "web" ? os : undefined,
      osName: first(
        device.osName,
        os === "ios" ? constants.systemName : undefined,
        os === "android" ? "Android" : undefined,
        deviceInfo.systemName,
      ),
      osVersion: first(
        device.osVersion,
        os === "ios" ? constants.osVersion : undefined,
        os === "android" ? constants.Release : undefined,
        deviceInfo.systemVersion,
        os === "ios" ? sources.Platform.Version : undefined,
      ),
      deviceBrand: first(
        device.brand,
        os === "android" ? constants.Brand : undefined,
        os === "ios" ? "Apple" : undefined,
        deviceInfo.brand,
      ),
      deviceModel: first(
        device.modelName,
        os === "android" ? constants.Model : undefined,
        deviceInfo.model,
      ),
      appName: first(application.applicationName, deviceInfo.appName),
      appId: first(application.applicationId, deviceInfo.bundleId),
      appVersion: first(
        application.nativeApplicationVersion,
        deviceInfo.appVersion,
      ),
      appBuild: first(application.nativeBuildVersion, deviceInfo.buildNumber),
      ...intlContext(),
    };
    for (const [key, value] of Object.entries(values))
      if (value !== undefined) (context as unknown as Bag)[key] = value;
  } catch {
    // Whatever was gathered before the failure is still worth sending.
  }
  return context;
}

const utf8 = (value: string): Uint8Array => {
  if (typeof TextEncoder === "function") return new TextEncoder().encode(value);
  // Older engines without TextEncoder: percent-encoding is UTF-8 already.
  const escaped = encodeURIComponent(value);
  const bytes: number[] = [];
  for (let index = 0; index < escaped.length; index += 1) {
    if (escaped[index] === "%") {
      bytes.push(parseInt(escaped.slice(index + 1, index + 3), 16));
      index += 2;
    } else bytes.push(escaped.charCodeAt(index));
  }
  return Uint8Array.from(bytes);
};

/** base64url of the context's UTF-8 JSON, with no Buffer or btoa needed. */
export function encodeDeviceContext(context: DaykeeperDeviceContext): string {
  const bytes = utf8(JSON.stringify(context));
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index]!;
    const b = bytes[index + 1];
    const c = bytes[index + 2];
    encoded += alphabet[a >> 2];
    encoded += alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)];
    if (b !== undefined) encoded += alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)];
    if (c !== undefined) encoded += alphabet[c & 63];
  }
  return encoded;
}
