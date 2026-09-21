import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const { version } = JSON.parse(
  readFileSync(new URL("package.json", root), "utf8"),
);
function verify(event: string, ref?: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, GITHUB_EVENT_NAME: event };
  delete env.GITHUB_REF_NAME;
  if (ref !== undefined) env.GITHUB_REF_NAME = ref;
  return spawnSync(process.execPath, ["scripts/verify-release.mjs"], {
    cwd: root,
    env,
    encoding: "utf8",
  });
}

test("release events require the exact package version tag", () => {
  assert.equal(verify("release", `v${version}`).status, 0);
  for (const ref of [undefined, "main", "v999.999.999"]) {
    const result = verify("release", ref);
    assert.notEqual(result.status, 0, `accepted release ref ${ref}`);
    assert.match(result.stderr, /AssertionError/);
  }
});

test("manual packaging does not mistake the workflow branch for a release tag", () => {
  assert.equal(verify("workflow_dispatch", "main").status, 0);
  assert.equal(verify("workflow_dispatch", "codex/package-check").status, 0);
});

test("local verification retains an explicitly supplied version assertion", () => {
  assert.equal(verify("", `v${version}`).status, 0);
  assert.notEqual(verify("", "v999.999.999").status, 0);
});
