import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateHost, waitForMarker } from "./safety.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const serial = validateHost(process.env, process.argv.slice(2));
const manifestPath = path.resolve(process.argv[3]);
const [packed, ...extra] = JSON.parse(readFileSync(manifestPath, "utf8"));
if (
  extra.length ||
  packed?.name !== "@skyporch/daykeeper-react-native" ||
  !/^[A-Za-z0-9_.-]+\.tgz$/.test(packed.filename)
)
  throw new Error("unexpected packed artifact");
const tarball = path.join(path.dirname(manifestPath), packed.filename);
const packageBytes = readFileSync(tarball);
const integrity = `sha512-${createHash("sha512").update(packageBytes).digest("base64")}`;
if (integrity !== packed.integrity)
  throw new Error("packed artifact integrity mismatch");
function command(exe, args, options = {}) {
  return execFileSync(exe, args, {
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
}
const adb = (...args) =>
  command("adb", ["-s", serial, ...args], { timeout: 10_000 }).trim();
if (
  adb("get-state") !== "device" ||
  adb("shell", "getprop", "ro.kernel.qemu") !== "1"
)
  throw new Error("refusing non-emulator target");
const work = mkdtempSync(path.join(tmpdir(), "daykeeper-hermes-smoke-"));
const app = path.join(work, "app");
const nonce = randomUUID();
const marker = `DAYKEEPER_HERMES_SMOKE_OK_${nonce}`;
const receipts = path.join(root, "hermes-smoke-results");
mkdirSync(receipts, { recursive: true });
// Retain generated files on the disposable hosted runner for diagnosis; no local
// device, global log clearing, credential files or arbitrary cleanup paths.
command(
  "npx",
  [
    "--yes",
    "@react-native-community/cli@20.2.0",
    "init",
    "DaykeeperHermesSmoke",
    "--version",
    "0.86.2",
    "--skip-install",
    "--directory",
    app,
  ],
  { stdio: "inherit", timeout: 180_000 },
);
copyFileSync(
  path.join(root, "verification/hermes/android/fixture.ts"),
  path.join(app, "fixture.ts"),
);
writeFileSync(
  path.join(app, "App.tsx"),
  readFileSync(
    path.join(root, "verification/hermes/android/App.tsx"),
    "utf8",
  ).replaceAll("DAYKEEPER_HERMES_SMOKE_OK", marker),
);
command("npm", ["install", "--no-audit", "--no-fund", tarball], {
  cwd: app,
  stdio: "inherit",
  timeout: 300_000,
});
const installed = JSON.parse(
  readFileSync(
    path.join(
      app,
      "node_modules/@skyporch/daykeeper-react-native/package.json",
    ),
    "utf8",
  ),
);
if (installed.version !== packed.version)
  throw new Error("installed package version mismatch");
command(
  "./gradlew",
  [
    "assembleRelease",
    "--no-daemon",
    "--console=plain",
    "--max-workers=2",
    "-PreactNativeArchitectures=x86_64",
    "-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m",
  ],
  { cwd: path.join(app, "android"), stdio: "inherit", timeout: 25 * 60_000 },
);
const applicationId = "com.daykeeperhermessmoke";
const metadata = JSON.parse(
  readFileSync(
    path.join(
      app,
      "android/app/build/outputs/apk/release/output-metadata.json",
    ),
    "utf8",
  ),
);
if (
  metadata.applicationId !== applicationId ||
  metadata.elements?.length !== 1 ||
  metadata.elements[0].outputFile !== "app-release.apk"
)
  throw new Error("unexpected APK metadata");
const apk = path.join(
  app,
  "android/app/build/outputs/apk/release/app-release.apk",
);
if (
  adb("shell", "pm", "list", "packages", applicationId).includes(applicationId)
)
  throw new Error("refusing to overwrite an installed app");
command("adb", ["-s", serial, "install", apk], {
  stdio: "inherit",
  timeout: 60_000,
});
adb("shell", "am", "start", "-W", "-n", `${applicationId}/.MainActivity`);
const dumpPath = `/sdcard/daykeeper-hermes-${nonce}.xml`;
await waitForMarker(async () => {
  adb("shell", "uiautomator", "dump", dumpPath);
  return adb("shell", "cat", dumpPath);
}, marker);
const receipt = {
  commit: process.env.GITHUB_SHA,
  reactNative: "0.86.2",
  hermes: true,
  packageVersion: packed.version,
  integrity,
  applicationId,
  marker,
  packageSha256: createHash("sha256").update(packageBytes).digest("hex"),
  apkSha256: createHash("sha256").update(readFileSync(apk)).digest("hex"),
  scope:
    "Packed SDK Android/Hermes runtime with synthetic Fetch responses; no live gateway or device parity claim",
};
writeFileSync(
  path.join(receipts, "receipt.json"),
  JSON.stringify(receipt, null, 2),
);
console.log(JSON.stringify(receipt));
