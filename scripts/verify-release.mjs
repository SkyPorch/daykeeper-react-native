import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile("package.json", "utf8"));
// Manual checks may select a branch or commit and have no release tag.
// The release event must still match the version exactly, including prepublish.
const expectedTag =
  process.env.GITHUB_EVENT_NAME === "workflow_dispatch"
    ? undefined
    : process.env.GITHUB_REF_NAME;
if (process.env.GITHUB_EVENT_NAME === "release") {
  assert.ok(expectedTag, "A release event requires a tag");
}

assert.notEqual(
  manifest.license,
  "UNLICENSED",
  "Choose a package license before publishing",
);
assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
if (expectedTag) {
  assert.equal(expectedTag, `v${manifest.version}`);
}
assert.equal(manifest.name, "@skyporch/daykeeper-react-native");
assert.equal(
  manifest.repository.url,
  "git+https://github.com/SkyPorch/daykeeper-react-native.git",
);
assert(
  (await readFile("CHANGELOG.md", "utf8")).includes(manifest.version),
  "Changelog must include the package version",
);
