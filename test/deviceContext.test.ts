import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";
import {
  collectDeviceContext,
  encodeDeviceContext,
} from "../src/deviceContext.ts";
import { SDK_VERSION } from "../src/version.ts";

register("./support/react-native-hooks.mjs", import.meta.url);

const sdk = { name: "react-native", version: "9.9.9" };
const decode = (value: string) =>
  JSON.parse(Buffer.from(value, "base64url").toString("utf8"));

const withExpoModules = async (
  modules: Record<string, unknown> | undefined,
  run: () => unknown,
) => {
  const scope = globalThis as { expo?: unknown };
  const previous = scope.expo;
  scope.expo = modules ? { modules } : undefined;
  try {
    return await run();
  } finally {
    scope.expo = previous;
  }
};

test("an Expo iOS app describes itself completely", async () => {
  const context = await withExpoModules(
    {
      ExpoApplication: {
        applicationName: "Attached",
        applicationId: "com.skyporch.attached",
        nativeApplicationVersion: "20261009.0",
        nativeBuildVersion: "174",
      },
      ExpoDevice: {
        brand: "Apple",
        modelName: "iPhone 16 Pro",
        osName: "iOS",
        osVersion: "26.6.1",
      },
    },
    () =>
      collectDeviceContext(
        {
          Platform: {
            OS: "ios",
            Version: "26.6.1",
            constants: { systemName: "iOS", osVersion: "26.6.1" },
          },
        },
        sdk,
      ),
  );
  assert.deepEqual(
    { ...(context as object), locale: undefined, timeZone: undefined },
    {
      sdk: "react-native",
      sdkVersion: "9.9.9",
      platform: "ios",
      osName: "iOS",
      osVersion: "26.6.1",
      deviceBrand: "Apple",
      deviceModel: "iPhone 16 Pro",
      appName: "Attached",
      appId: "com.skyporch.attached",
      appVersion: "20261009.0",
      appBuild: "174",
      locale: undefined,
      timeZone: undefined,
    },
  );
  assert.equal(
    (context as { timeZone?: string }).timeZone,
    new Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
});

test("a bare React Native Android app still reports OS, brand and model", async () => {
  const context = await withExpoModules(undefined, () =>
    collectDeviceContext(
      {
        Platform: {
          OS: "android",
          Version: 36,
          constants: { Release: "16", Brand: "google", Model: "Pixel 10" },
        },
      },
      sdk,
    ),
  );
  assert.equal((context as { platform: string }).platform, "android");
  assert.equal((context as { osName: string }).osName, "Android");
  assert.equal((context as { osVersion: string }).osVersion, "16");
  assert.equal((context as { deviceBrand: string }).deviceBrand, "google");
  assert.equal((context as { deviceModel: string }).deviceModel, "Pixel 10");
  assert.equal(Object.hasOwn(context as object, "appVersion"), false);
});

test("react-native-device-info fills the app when Expo is absent", async () => {
  const context = await withExpoModules(undefined, () =>
    collectDeviceContext(
      {
        Platform: { OS: "ios", constants: { systemName: "iPadOS" } },
        TurboModuleRegistry: {
          get: (name) =>
            name === "RNDeviceInfo"
              ? {
                  getConstants: () => ({
                    appName: "Example",
                    bundleId: "com.example.app",
                    appVersion: "3.1.0",
                    buildNumber: "88",
                    model: "iPad Pro",
                  }),
                }
              : null,
        },
      },
      sdk,
    ),
  );
  assert.equal((context as { osName: string }).osName, "iPadOS");
  assert.equal((context as { deviceBrand: string }).deviceBrand, "Apple");
  assert.equal((context as { deviceModel: string }).deviceModel, "iPad Pro");
  assert.equal((context as { appName: string }).appName, "Example");
  assert.equal((context as { appId: string }).appId, "com.example.app");
  assert.equal((context as { appVersion: string }).appVersion, "3.1.0");
  assert.equal((context as { appBuild: string }).appBuild, "88");
});

test("a platform that throws still yields the SDK's own identity", () => {
  const context = collectDeviceContext(
    {
      Platform: {
        OS: "ios",
        get constants(): unknown {
          throw new Error("synthetic");
        },
      },
    },
    sdk,
  );
  assert.equal(context.sdk, "react-native");
  assert.equal(context.sdkVersion, "9.9.9");
});

test("the header is base64url UTF-8 JSON", () => {
  const encoded = encodeDeviceContext({
    sdk: "react-native",
    sdkVersion: "1.0.0",
    appName: "Été 日記 🌿",
  });
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.equal(decode(encoded).appName, "Été 日記 🌿");
});

test("the reported SDK version is the package version", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(SDK_VERSION, manifest.version);
});

test("every native request describes the device, and opting out sends nothing", async () => {
  (
    globalThis as { __daykeeperReactNativeStub?: unknown }
  ).__daykeeperReactNativeStub = {
    OS: "android",
    constants: { Release: "16", Brand: "google", Model: "Pixel 10" },
  };
  const { createDaykeeperReactNativeClient } = await import("../src/native.ts");
  for (const sendDeviceContext of [undefined, false]) {
    const requests: Request[] = [];
    const client = createDaykeeperReactNativeClient({
      baseUrl: "https://support.example.test",
      getAccessToken: () => "synthetic-customer-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({ conversations: [] });
      },
      ...(sendDeviceContext === undefined ? {} : { sendDeviceContext }),
    });
    await client.listConversations();
    await client.createConversation();
    assert.equal(requests.length, 2);
    for (const request of requests) {
      const header = request.headers.get("daykeeper-client");
      if (sendDeviceContext === false) {
        assert.equal(header, null);
        continue;
      }
      assert.ok(header);
      const context = decode(header);
      assert.equal(context.sdk, "react-native");
      assert.equal(context.sdkVersion, SDK_VERSION);
      assert.equal(context.platform, "android");
      assert.equal(context.deviceModel, "Pixel 10");
    }
  }
});
