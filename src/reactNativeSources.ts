// Loaded lazily by the native entry. Named imports compile to plain property
// reads under Metro; a dynamic import of "react-native" itself would run
// `require.importAll`, evaluating every lazy export (and its native side
// effects) just to read Platform, which crashed a Release iOS build.
import { Platform, TurboModuleRegistry } from "react-native";
import type { ReactNativeDeviceSources } from "./deviceContext.js";

export function reactNativeSources(): ReactNativeDeviceSources {
  return { Platform, TurboModuleRegistry };
}
