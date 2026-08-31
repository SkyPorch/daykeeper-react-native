// Mount only in a dedicated, data-free development client. No product app entry,
// login, persistence, analytics, or real credentials are used by this fixture.
import React, { useState } from "react";
import { AppRegistry, Platform, Pressable, Text, View } from "react-native";
import * as sdk from "@skyporch/daykeeper-react-native";
import { runReplayCases } from "./cases.js";

if (!__DEV__) throw new Error("Synthetic fixture requires development mode");
const origin = "http://127.0.0.1:18244";

function Fixture() {
  const [state, setState] = useState("Ready");
  const [started, setStarted] = useState(false);
  const run = async () => {
    if (started) return;
    setStarted(true);
    try {
      const result = await runReplayCases(
        sdk,
        origin,
        `native-${Platform.OS}`,
        (count) => setState(`Checked ${count} cases`),
        Platform.OS,
      );
      const response = await fetch(`${origin}/__fixture/result`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...result,
          runtime: {
            platform: Platform.OS,
            version: Platform.Version,
            react: React.version,
            reactNative: Platform.constants.reactNativeVersion,
            hermes: typeof globalThis.HermesInternal !== "undefined",
          },
        }),
      });
      if (!response.ok) throw new Error("Synthetic result receipt failed");
      setState(
        `Passed ${result.cases} cases; ${result.sdkCalls} SDK dispatches; ${result.calls} wire requests`,
      );
    } catch (error) {
      setState(`Failed: ${error.message}`);
      await fetch(`${origin}/__fixture/result`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          run: `native-${Platform.OS}`,
          failed: String(error.message),
        }),
      }).catch(() => {});
    }
  };
  return (
    <View
      style={{
        flex: 1,
        padding: "8%",
        paddingTop: "25%",
        backgroundColor: "#ffffff",
      }}
    >
      <Text style={{ color: "#171717" }}>
        Daykeeper synthetic SDK transport fixture
      </Text>
      <Text
        style={{ color: "#171717", marginVertical: "8%" }}
        testID="daykeeper-result"
      >
        {state}
      </Text>
      <Pressable
        testID="daykeeper-run"
        accessibilityRole="button"
        disabled={started}
        onPress={run}
        style={{ padding: "8%", backgroundColor: "#047857" }}
      >
        <Text style={{ color: "#ffffff" }}>Run synthetic SDK checks</Text>
      </Pressable>
    </View>
  );
}

AppRegistry.registerComponent("main", () => Fixture);
