import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const manifest = (await import("../package.json", { with: { type: "json" } }))
  .default;
const root = manifest.exports["."];
const ui = manifest.exports["./ui"];

assert.equal(root["react-native"].default, "./dist/index.js");
assert.equal(root["react-native"].types, "./dist/index.d.ts");
assert.equal(ui["react-native"].default, "./dist/ui/index.js");
assert.equal(ui["react-native"].types, "./dist/ui/index.d.ts");

const esm = await import("../dist/index.js");
const cjs = createRequire(import.meta.url)("../dist/index.cjs");
for (const entry of [esm, cjs]) {
  assert.equal(typeof entry.createDaykeeperReactNativeClient, "function");
  assert.equal(typeof entry.DaykeeperReactNativeClient, "function");
}
for (const file of [
  "../dist/ui/index.js",
  "../dist/ui/index.cjs",
  "../dist/ui/index.d.ts",
]) {
  assert.match(
    await readFile(new URL(file, import.meta.url), "utf8"),
    /DaykeeperConversationTemplate/,
  );
}
