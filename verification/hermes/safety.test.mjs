import assert from "node:assert/strict";
import test from "node:test";
import {
  validateHost,
  validateIosHost,
  validateIosSimulatorReceipt,
  waitForMarker,
} from "./safety.mjs";
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
test("requires an explicitly owned hosted macOS simulator", () => {
  const mac = {
    GITHUB_ACTIONS: "true",
    GITHUB_RUN_ID: "123",
    GITHUB_RUN_ATTEMPT: "1",
    RUNNER_OS: "macOS",
    RUNNER_ENVIRONMENT: "github-hosted",
    SIMULATOR_UDID: "01234567-89ab-cdef-0123-456789abcdef",
    SIMULATOR_NAME: "DaykeeperHermesSmoke-123-1",
  };
  assert.deepEqual(validateIosHost(mac, ["--execute", "pack.json"]), {
    udid: mac.SIMULATOR_UDID,
    name: mac.SIMULATOR_NAME,
  });
  for (const invalid of [
    { ...mac, RUNNER_ENVIRONMENT: "self-hosted" },
    { ...mac, SIMULATOR_UDID: "booted" },
    { ...mac, RUNNER_OS: "Linux" },
    { ...mac, SIMULATOR_NAME: "DaykeeperHermesSmoke-123-2" },
    { ...mac, GITHUB_RUN_ID: "456" },
  ])
    assert.throws(() => validateIosHost(invalid, ["--execute", "pack.json"]));
});
test("binds Hermes execution to the workflow-created simulator receipt", () => {
  const expected = {
    udid: "01234567-89ab-cdef-0123-456789abcdef",
    name: "DaykeeperHermesSmoke-123-1",
    runId: "123",
    runAttempt: "1",
  };
  validateIosSimulatorReceipt({ ...expected }, expected);
  for (const altered of [
    { ...expected, udid: "fedcba98-7654-3210-fedc-ba9876543210" },
    { ...expected, name: "DaykeeperHermesSmoke-123-2" },
    { ...expected, runId: "456" },
    { ...expected, runAttempt: "2" },
  ]) {
    assert.throws(
      () => validateIosSimulatorReceipt(altered, expected),
      /does not match this run attempt/,
    );
  }
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
