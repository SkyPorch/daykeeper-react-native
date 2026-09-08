import assert from "node:assert/strict";
import test from "node:test";
import { validateHost, waitForMarker } from "./safety.mjs";
const env = {
  GITHUB_ACTIONS: "true",
  RUNNER_OS: "Linux",
  RUNNER_ENVIRONMENT: "github-hosted",
  ANDROID_SERIAL: "emulator-5554",
  EMULATOR_PORT: "5554",
};
test("requires explicit execution and disposable owned emulator", () => {
  assert.equal(validateHost(env, ["--execute", "pack.json"]), "emulator-5554");
  for (const invalid of [
    {},
    { ...env, RUNNER_ENVIRONMENT: "self-hosted" },
    { ...env, ANDROID_SERIAL: "physical-device" },
    { ...env, EMULATOR_PORT: "5556" },
  ]) {
    assert.throws(() => validateHost(invalid, ["--execute", "pack.json"]));
  }
  assert.throws(() => validateHost(env, ["pack.json"]));
});
const marker = "DAYKEEPER_HERMES_SMOKE_OK_abcd-1234";
test("waits for exact rendered current-run marker, not substrings", async () => {
  let time = 0,
    reads = 0;
  await waitForMarker(
    async () =>
      ++reads === 1
        ? `<node text="${marker}-stale"/>`
        : `<node text="${marker}"/>`,
    marker,
    {
      now: () => time,
      sleep: async (ms) => {
        time += ms;
      },
    },
  );
  assert.equal(reads, 2);
});
test("fails on explicit failure and on observation deadline", async () => {
  await assert.rejects(
    waitForMarker(async () => '<node text="FAILED"/>', marker),
    /fixture failed/,
  );
  let time = 0;
  await assert.rejects(
    waitForMarker(
      async () => {
        throw new Error("unavailable");
      },
      marker,
      {
        now: () => time,
        sleep: async (ms) => {
          time += ms;
        },
        timeout: 3_000,
      },
    ),
    /deadline/,
  );
});
