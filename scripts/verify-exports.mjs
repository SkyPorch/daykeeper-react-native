import assert from "node:assert/strict";
import { createRequire } from "node:module";

const manifest = (await import("../package.json", { with: { type: "json" } }))
  .default;
const root = manifest.exports["."];

assert.equal(root["react-native"].default, "./dist/native.js");
assert.equal(root["react-native"].types, "./dist/native.d.ts");
assert.equal(root["react-native"].import, "./dist/native.js");
assert.equal(root["react-native"].require, "./dist/native.cjs");
assert.equal(manifest["react-native"], root["react-native"].default);

const esm = await import("../dist/index.js");
const cjs = createRequire(import.meta.url)("../dist/index.cjs");
const nativeEsm = await import("../dist/native.js");
const nativeCjs = createRequire(import.meta.url)("../dist/native.cjs");
for (const entry of [esm, cjs, nativeEsm, nativeCjs]) {
  assert.equal(typeof entry.createDaykeeperReactNativeClient, "function");
  assert.equal(typeof entry.DaykeeperReactNativeClient, "function");
}
for (const entry of [nativeEsm, nativeCjs]) {
  let credentials = 0;
  assert.throws(
    () =>
      entry.createDaykeeperReactNativeClient({
        baseUrl: "https://support.example.test",
        getAccessToken: () => {
          credentials++;
          return "synthetic";
        },
      }),
    (error) =>
      error instanceof entry.DaykeeperReactNativeTransportError &&
      error.code === "INVALID_CONFIGURATION" &&
      error.outcomeUnknown === false,
  );
  assert.equal(credentials, 0);
}
