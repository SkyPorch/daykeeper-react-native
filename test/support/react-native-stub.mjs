// The slice of react-native the device-context collector reads. Tests set
// globalThis.__daykeeperReactNativeStub before constructing a client.
const stub = () => globalThis.__daykeeperReactNativeStub ?? {};
export const Platform = {
  get OS() {
    return stub().OS ?? "ios";
  },
  get Version() {
    return stub().Version;
  },
  get constants() {
    return stub().constants ?? {};
  },
};
export const NativeModules = {};
export const TurboModuleRegistry = { get: () => null };
