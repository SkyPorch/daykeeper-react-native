import assert from "node:assert/strict";
import { createRequire } from "node:module";

const manifest = (await import("../package.json", { with: { type: "json" } }))
  .default;
const root = manifest.exports["."];

assert.equal(root["react-native"].default, "./dist/index.js");
assert.equal(root["react-native"].types, "./dist/index.d.ts");

const esm = await import("../dist/index.js");
const cjs = createRequire(import.meta.url)("../dist/index.cjs");
for (const entry of [esm, cjs]) {
  assert.equal(typeof entry.createDaykeeperReactNativeClient, "function");
  assert.equal(typeof entry.DaykeeperReactNativeClient, "function");
}
