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
import { validateIosHost } from "../safety.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const { udid: simulator, name: simulatorName } = validateIosHost(
  process.env,
  process.argv.slice(2),
);
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
function simctl(...args) {
  return command("xcrun", ["simctl", ...args]).trim();
}
const devices = JSON.parse(simctl("list", "devices", "available", "-j"));
const selected = Object.values(devices.devices ?? {})
  .flat()
  .find((device) => device.udid === simulator);
if (!selected || selected.name !== simulatorName || selected.state !== "Booted")
  throw new Error("refusing non-booted owned simulator");
const work = mkdtempSync(path.join(tmpdir(), "daykeeper-hermes-ios-smoke-"));
const app = path.join(work, "app");
const derivedData = path.join(work, "derived-data");
const nonce = randomUUID();
const marker = `DAYKEEPER_HERMES_SMOKE_OK_${nonce}`;
const receipts = path.join(root, "hermes-smoke-results");
mkdirSync(receipts, { recursive: true });
const applicationId = "com.daykeeperhermessmoke";
const resultBundle = path.join(work, "ios-tests.xcresult");
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
command("bundle", ["config", "set", "--local", "path", "vendor/bundle"], {
  cwd: app,
});
command("bundle", ["install"], {
  cwd: app,
  stdio: "inherit",
  timeout: 300_000,
});
command(
  "bundle",
  [
    "exec",
    "ruby",
    path.join(root, "verification/hermes/ios/create-uitest.test.rb"),
  ],
  {
    cwd: app,
    stdio: "inherit",
  },
);
command("bundle", ["exec", "pod", "install"], {
  cwd: path.join(app, "ios"),
  stdio: "inherit",
  timeout: 10 * 60_000,
});
const uiTestSource = path.join(app, "DaykeeperHermesSmokeUITests.swift");
writeFileSync(
  uiTestSource,
  `import XCTest

final class DaykeeperHermesSmokeUITests: XCTestCase {
  func testRenderedHermesMarker() {
    let app = XCUIApplication()
    app.launch()
    XCTAssertTrue(app.staticTexts["${marker}"].waitForExistence(timeout: 90))
  }
}
`,
);
command(
  "bundle",
  [
    "exec",
    "ruby",
    path.join(root, "verification/hermes/ios/create-uitest.rb"),
    path.join(app, "ios/DaykeeperHermesSmoke.xcodeproj"),
    uiTestSource,
  ],
  { cwd: app, stdio: "inherit" },
);
command(
  "xcodebuild",
  [
    "-workspace",
    "DaykeeperHermesSmoke.xcworkspace",
    "-scheme",
    "DaykeeperHermesSmokeUITests",
    "-configuration",
    "Release",
    "-sdk",
    "iphonesimulator",
    "-destination",
    `id=${simulator}`,
    "-derivedDataPath",
    derivedData,
    "-resultBundlePath",
    resultBundle,
    "-only-testing:DaykeeperHermesSmokeUITests/DaykeeperHermesSmokeUITests/testRenderedHermesMarker",
    "test",
    "CODE_SIGNING_ALLOWED=NO",
  ],
  { cwd: path.join(app, "ios"), stdio: "inherit", timeout: 25 * 60_000 },
);
const testSummary = JSON.parse(
  command("xcrun", [
    "xcresulttool",
    "get",
    "test-results",
    "summary",
    "--path",
    resultBundle,
  ]),
);
if (
  testSummary.totalTestCount !== 1 ||
  testSummary.passedTests !== 1 ||
  testSummary.failedTests !== 0 ||
  testSummary.skippedTests !== 0
)
  throw new Error("unexpected XCUITest result summary");
const appExecutable = path.join(
  derivedData,
  "Build/Products/Release-iphonesimulator/DaykeeperHermesSmoke.app/DaykeeperHermesSmoke",
);
const receipt = {
  commit: process.env.GITHUB_SHA,
  reactNative: "0.86.2",
  hermes: true,
  packageVersion: packed.version,
  integrity,
  applicationId,
  simulator,
  simulatorName,
  marker,
  packageSha256: createHash("sha256").update(packageBytes).digest("hex"),
  appExecutableSha256: createHash("sha256")
    .update(readFileSync(appExecutable))
    .digest("hex"),
  scope:
    "Packed SDK iOS/Hermes runtime with synthetic Fetch responses; no live gateway or device parity claim",
};
writeFileSync(
  path.join(receipts, "ios-receipt.json"),
  JSON.stringify(receipt, null, 2),
);
console.log(JSON.stringify(receipt));
