import assert from "node:assert/strict";
import test from "node:test";
import { sceneLifecycle } from "./scene-lifecycle.mjs";

const template = `class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?
  var reactNativeFactory: RCTReactNativeFactory?
  func launch() {
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "DaykeeperHermesSmoke",
      in: window,
      launchOptions: launchOptions
    )
  }
}`;

test("fixture starts React Native once in its declared window scene", () => {
  const input = { CFBundleName: "Synthetic fixture" };
  const result = sceneLifecycle(template, input);
  assert.equal(input.UIApplicationSceneManifest, undefined);
  assert.equal(result.infoPlist.CFBundleName, input.CFBundleName);
  const scene = result.infoPlist.UIApplicationSceneManifest;
  assert.equal(scene.UIApplicationSupportsMultipleScenes, false);
  const name =
    scene.UISceneConfigurations.UIWindowSceneSessionRoleApplication[0]
      .UISceneDelegateClassName;
  assert.ok(result.appDelegate.includes(`@objc(${name})`));
  assert.equal(result.appDelegate.split("factory.startReactNative(").length, 2);
  assert.ok(!result.appDelegate.includes("UIWindow(frame:"));
  assert.ok(result.appDelegate.includes("UIWindow(windowScene: windowScene)"));
});

test("unrecognized or already-migrated templates fail before being overwritten", () => {
  assert.throws(
    () =>
      sceneLifecycle(template.replace("DaykeeperHermesSmoke", "OtherApp"), {}),
    /Unexpected/,
  );
  assert.throws(
    () =>
      sceneLifecycle(
        template.replace("var reactNativeFactory:", "var otherFactory:"),
        {},
      ),
    /Unexpected/,
  );
  assert.throws(
    () => sceneLifecycle(template, { UIApplicationSceneManifest: {} }),
    /Unexpected/,
  );
});

test("pinned template permits a blank line before factory startup", () => {
  const source = template.replace(
    "\n    factory.startReactNative(",
    "\n\n    factory.startReactNative(",
  );
  const result = sceneLifecycle(source, {});
  assert.equal(result.appDelegate.split("factory.startReactNative(").length, 2);
  assert.ok(!result.appDelegate.includes("UIWindow(frame:"));
});
