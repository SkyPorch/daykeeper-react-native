const legacyStartup = `    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "DaykeeperHermesSmoke",
      in: window,
      launchOptions: launchOptions
    )`;

// Adapt only this synthetic, launch-only fixture. Keep the pinned SDK/RN versions.
export function sceneLifecycle(appDelegate, infoPlist) {
  if (
    appDelegate.split(legacyStartup).length !== 2 ||
    !appDelegate.includes("var reactNativeFactory: RCTReactNativeFactory?") ||
    infoPlist.UIApplicationSceneManifest !== undefined
  )
    throw new Error(
      "Unexpected fixture lifecycle template; inspect before adopting scenes",
    );
  return {
    appDelegate:
      appDelegate.replace(legacyStartup, "") +
      `

@objc(DaykeeperSmokeSceneDelegate)
class DaykeeperSmokeSceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
      let appDelegate = UIApplication.shared.delegate as? AppDelegate,
      let factory = appDelegate.reactNativeFactory else {
      fatalError("Fixture React Native factory missing")
    }
    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window
    factory.startReactNative(
      withModuleName: "DaykeeperHermesSmoke",
      in: window,
      launchOptions: nil
    )
  }
}
`,
    infoPlist: {
      ...infoPlist,
      UIApplicationSceneManifest: {
        UIApplicationSupportsMultipleScenes: false,
        UISceneConfigurations: {
          UIWindowSceneSessionRoleApplication: [
            {
              UISceneConfigurationName: "Default Configuration",
              UISceneDelegateClassName: "DaykeeperSmokeSceneDelegate",
            },
          ],
        },
      },
    },
  };
}
