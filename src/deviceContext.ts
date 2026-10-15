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

// Control characters and bidi overrides have no place in a device name and
// would only make what an agent reads misleading.
const UNPRINTABLE = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;

const text = (value: unknown): string | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= 100 && !UNPRINTABLE.test(trimmed)
    ? trimmed
    : undefined;
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

/** A read that may throw (JSI getters can) answers nothing instead. */
const safely = <T>(read: () => T): T | undefined => {
  try {
    return read();
  } catch {
    return undefined;
  }
};

type ReportedField = Exclude<
  keyof DaykeeperDeviceContext,
  "sdk" | "sdkVersion" | "locale" | "timeZone"
>;

export function collectDeviceContext(
  sources: ReactNativeDeviceSources,
  sdk: { name: string; version: string },
): DaykeeperDeviceContext {
  const context: DaykeeperDeviceContext = {
    sdk: sdk.name,
    sdkVersion: sdk.version,
  };
  // Each source and each field is read on its own, so one that throws costs
  // only what it would have answered.
  const os = safely(() => sources.Platform?.OS);
  const constants = safely(() => record(sources.Platform?.constants)) ?? {};
  const application = safely(() => expoModule("ExpoApplication")) ?? {};
  const device = safely(() => expoModule("ExpoDevice")) ?? {};
  const deviceInfo = safely(() => deviceInfoConstants(sources)) ?? {};
  const read = (bag: Bag, key: string) => safely(() => bag[key]);
  const fields: Record<ReportedField, () => unknown> = {
    platform: () =>
      os === "ios" || os === "android" || os === "web" ? os : undefined,
    osName: () =>
      first(
        read(device, "osName"),
        os === "ios" ? read(constants, "systemName") : undefined,
        os === "android" ? "Android" : undefined,
        read(deviceInfo, "systemName"),
      ),
    osVersion: () =>
      first(
        read(device, "osVersion"),
        os === "ios" ? read(constants, "osVersion") : undefined,
        os === "android" ? read(constants, "Release") : undefined,
        read(deviceInfo, "systemVersion"),
        os === "ios" ? safely(() => sources.Platform.Version) : undefined,
      ),
    deviceBrand: () =>
      first(
        read(device, "brand"),
        os === "android" ? read(constants, "Brand") : undefined,
        os === "ios" ? "Apple" : undefined,
        read(deviceInfo, "brand"),
      ),
    deviceModel: () =>
      first(
        read(device, "modelName"),
        os === "android" ? read(constants, "Model") : undefined,
        read(deviceInfo, "model"),
      ),
    appName: () =>
      first(read(application, "applicationName"), read(deviceInfo, "appName")),
    appId: () =>
      first(read(application, "applicationId"), read(deviceInfo, "bundleId")),
    appVersion: () =>
      first(
        read(application, "nativeApplicationVersion"),
        read(deviceInfo, "appVersion"),
      ),
    appBuild: () =>
      first(
        read(application, "nativeBuildVersion"),
        read(deviceInfo, "buildNumber"),
      ),
  };
  for (const [key, answer] of Object.entries(fields)) {
    const value = safely(answer);
    if (value !== undefined) (context as unknown as Bag)[key] = value;
  }
  return Object.assign(context, intlContext());
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
