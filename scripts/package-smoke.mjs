import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  realpath,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runReplayCases } from "../smoke/replay/cases.js";
import { startFixture } from "../smoke/replay/server.mjs";
import { runBoundaryCases } from "../smoke/boundary/cases.js";
import { startBoundaryFixture } from "../smoke/boundary/server.mjs";
import { runCacheCases } from "../smoke/cache/cases.js";
import { startCacheFixture } from "../smoke/cache/server.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
await mkdir(join(root, ".smoke"), { recursive: true });
const directory = await mkdtemp(join(root, ".smoke/package-"));
const consumer = join(directory, "consumer");
await mkdir(consumer);
// A cold npm cache and packed local runtime dependency ensure no registry access
// or hidden dependency on this checkout's installed package during the smoke.
const env = {
  ...process.env,
  npm_config_cache: join(directory, "npm-cache"),
  npm_config_registry: "http://127.0.0.1:1",
};
const run = (command, args, cwd) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    const timeout = setTimeout(() => child.kill("SIGKILL"), 120000);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} exited ${code}: ${stderr || stdout}`));
    });
  });
const pack = async (cwd) => {
  const [result] = JSON.parse(
    await run(
      "npm",
      ["pack", "--ignore-scripts", "--json", "--pack-destination", directory],
      cwd,
    ),
  );
  return { ...result, tarball: join(directory, result.filename) };
};
const artifact = await pack(root);
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
assert.equal(artifact.name, "@skyporch/daykeeper-react-native");
assert.equal(artifact.version, manifest.version);
for (const file of artifact.files) {
  assert(
    /^(dist\/(index|native|chunk-[A-Z0-9]+)\.(js|cjs|d\.ts|d\.cts)(\.map)?|package\.json|LICENSE|README\.md|CHANGELOG\.md|COMPATIBILITY\.md)$/.test(
      file.path,
    ),
    `Unexpected packed file: ${file.path}`,
  );
}
const runtimeRoot = await realpath(join(root, "node_modules/@babel/runtime"));
const runtime = await pack(runtimeRoot);
await writeFile(
  join(consumer, "package.json"),
  JSON.stringify({
    name: "daykeeper-native-smoke-consumer",
    private: true,
    type: "module",
    version: "0.0.0",
  }),
);
await run(
  "npm",
  [
    "install",
    "--offline",
    "--ignore-scripts",
    "--legacy-peer-deps",
    "--no-audit",
    "--no-fund",
    "--package-lock=false",
    runtime.tarball,
    artifact.tarball,
  ],
  consumer,
);
const installedRoot = join(
  consumer,
  "node_modules/@skyporch/daykeeper-react-native",
);
const installed = JSON.parse(
  await readFile(join(installedRoot, "package.json"), "utf8"),
);
assert.deepEqual(installed, manifest);
const moduleSource = 'export * from "@skyporch/daykeeper-react-native";';
await writeFile(join(consumer, "entry.mjs"), moduleSource);
const typeSource = `import { DaykeeperReactNativeClient, DaykeeperReactNativeApiError, DaykeeperReactNativeTransportError } from "@skyporch/daykeeper-react-native";
const client = new DaykeeperReactNativeClient({ baseUrl: "https://support.example.test", getAccessToken: ({ signal, forceRefresh }) => "token", fetch: globalThis.fetch });
client.sendMessage(1, "Synthetic");
for (const error of [new DaykeeperReactNativeApiError({ status: 503 }), new DaykeeperReactNativeTransportError({ code: "NETWORK_ERROR", message: "Safe", outcomeUnknown: true })]) {
  const unknown: boolean = error.outcomeUnknown;
  const serialized: boolean = error.toJSON().outcomeUnknown;
}
`;
for (const extension of ["mts", "cts"])
  await writeFile(join(consumer, `types.${extension}`), typeSource);
await run(
  join(root, "node_modules/.bin/tsc"),
  [
    "--noEmit",
    "--strict",
    "--skipLibCheck",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--target",
    "ES2022",
    "--lib",
    "ES2022,DOM,DOM.Iterable",
    "types.mts",
    "types.cts",
  ],
  consumer,
);
await run(
  join(root, "node_modules/.bin/tsc"),
  [
    "--noEmit",
    "--strict",
    "--skipLibCheck",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--target",
    "ES2022",
    "--lib",
    "ES2022,DOM,DOM.Iterable",
    "--customConditions",
    "react-native",
    "types.mts",
    "types.cts",
  ],
  consumer,
);
const esm = await import(pathToFileURL(join(consumer, "entry.mjs")));
const cjs = createRequire(join(consumer, "package.json"))(manifest.name);
const nativeExport = await run(
  process.execPath,
  [
    "--conditions=react-native",
    "--input-type=module",
    "-e",
    `import assert from 'node:assert/strict'; import * as sdk from '${manifest.name}'; console.log(import.meta.resolve('${manifest.name}')); assert.throws(() => sdk.createDaykeeperReactNativeClient({baseUrl:'https://support.example.test',getAccessToken:()=>{throw new Error('Credentials must not run')}}), error => error instanceof sdk.DaykeeperReactNativeTransportError && error.code === 'INVALID_CONFIGURATION');`,
  ],
  consumer,
);
assert(
  nativeExport
    .trim()
    .endsWith("/node_modules/@skyporch/daykeeper-react-native/dist/native.js"),
);
const nativeRequire = await run(
  process.execPath,
  [
    "--conditions=react-native",
    "-e",
    `const assert=require('node:assert/strict'); const sdk=require('${manifest.name}'); console.log(require.resolve('${manifest.name}')); assert.throws(() => new sdk.DaykeeperReactNativeClient({baseUrl:'https://support.example.test',getAccessToken:()=>{throw new Error('Credentials must not run')}}), error => error instanceof sdk.DaykeeperReactNativeTransportError && error.code === 'INVALID_CONFIGURATION');`,
  ],
  consumer,
);
assert(nativeRequire.trim().endsWith("/dist/native.cjs"));
const nativeEsm = await import(
  pathToFileURL(
    join(installedRoot, installed.exports["."]["react-native"].import),
  )
);
const nativeCjs = createRequire(join(consumer, "package.json"))(
  join(installedRoot, installed.exports["."]["react-native"].require),
);
const implementations = [
  ["esm", esm],
  ["cjs", cjs],
  ["native-esm", nativeEsm],
  ["native-cjs", nativeCjs],
];
const cacheFixture = await startCacheFixture();
const caches = [];
try {
  for (const [name, sdk] of implementations) {
    caches.push(
      await runCacheCases({
        createClient: (options) =>
          new sdk.DaykeeperReactNativeClient({ ...options, fetch }),
        transport: fetch,
        origin: cacheFixture.origin,
        run: name,
        nativeHeaders: name.startsWith("native-"),
      }),
    );
  }
} finally {
  await cacheFixture.close();
}
const fixture = await startFixture();
const runs = [];
try {
  for (const [name, sdk] of implementations)
    runs.push(await runReplayCases(sdk, fixture.origin, name));
} finally {
  await fixture.close();
}
const boundaryFixture = await startBoundaryFixture();
const boundaries = [];
try {
  for (const [name, sdk] of [
    ["esm", esm],
    ["cjs", cjs],
  ]) {
    const id = `${name}-implicit-node`;
    const client = new sdk.DaykeeperReactNativeClient({
      baseUrl: `${boundaryFixture.origin}/case/${id}/307/cross`,
      getAccessToken: () => "synthetic-customer-token",
    });
    await assert.rejects(
      client.getUnread(),
      (error) =>
        error instanceof sdk.DaykeeperReactNativeTransportError &&
        error.code === "NETWORK_ERROR",
    );
    const record = await (
      await fetch(`${boundaryFixture.origin}/record/${id}`)
    ).json();
    assert.equal(record.source.length, 1);
    assert.equal(record.sink.length, 0);
  }
  for (const [name, sdk] of implementations) {
    for (const strict of [false, true]) {
      const report = await runBoundaryCases(
        sdk,
        globalThis.fetch,
        boundaryFixture.origin,
        `${name}-${strict ? "strict" : "default"}`,
        strict,
      );
      assert.equal(report.summary.cases, 56);
      assert.equal(report.summary.redirects, 50);
      // SDK policy is enforced even when no extra caller wrapper is supplied.
      assert.equal(report.summary.followed, 0);
      assert.equal(report.summary.forwardedAuthorization, 0);
      assert.equal(report.summary.forwardedBodies, 0);
      assert.equal(report.summary.rejected, 50);
      // Node has no ambient cookie jar; this is not native cookie certification.
      assert.equal(report.cookie.controlPresent, false);
      assert.equal(report.cookie.sourceReceived, false);
      boundaries.push(report);
    }
  }
} finally {
  await boundaryFixture.close();
}
const result = {
  package: manifest.name,
  version: manifest.version,
  node: process.version,
  tarball: artifact.tarball,
  installedRoot,
  sha256: createHash("sha256")
    .update(await readFile(artifact.tarball))
    .digest("hex"),
  checks: [
    "cold-cache offline installation",
    "installed ESM and CJS exports",
    "ESM/CJS declarations",
    "react-native export condition",
    "real loopback HTTP transport; no mocked fetch",
  ],
  runs,
  boundaries,
  caches,
};
await writeFile(
  join(directory, "result.json"),
  JSON.stringify(result, null, 2),
);
await writeFile(
  join(root, ".smoke/latest-package.json"),
  JSON.stringify(result, null, 2),
);
console.log(
  JSON.stringify(
    {
      ...result,
      caches: caches.map(({ run, summary }) => ({ run, summary })),
      runs: runs.map(({ run, cases, calls }) => ({ run, cases, calls })),
      boundaries: boundaries.map(({ run, strict, summary, cookie }) => ({
        run,
        strict,
        summary,
        cookie,
      })),
    },
    null,
    2,
  ),
);
