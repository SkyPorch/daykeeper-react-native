// Run only in a dedicated, data-free development client with Expo installed.
// No product entry, account, storage, analytics or real credentials are imported.
import React, { useState } from "react";
import { AppRegistry, Platform, Pressable, Text, View } from "react-native";
import * as sdk from "@skyporch/daykeeper-react-native";
import { runBoundaryCases } from "./cases.js";

if (!__DEV__) throw new Error("Synthetic fixture requires development mode");
const origin = "http://127.0.0.1:18246";
const ambientFetch = globalThis.fetch;
// Use the exported XHR-backed implementation, not whichever implementation a
// host runtime may already have installed in globalThis.fetch.
const xhrFetch = require("whatwg-fetch").fetch;

function Fixture() {
  const [state, setState] = useState("Ready");
  const [started, setStarted] = useState(false);
  const run = async () => {
    if (started) return;
    setStarted(true);
    const reports = [];
    try {
      for (const [name, transport, strict] of [
        ["ambient", ambientFetch, false],
        ["xhr", xhrFetch, false],
        ["xhr-strict", xhrFetch, true],
      ]) {
        setState(`Checking ${name}`);
        reports.push(
          await runBoundaryCases(
            sdk,
            transport,
            origin,
            `${Platform.OS}-${name}`,
            strict,
          ),
        );
      }
      // Delay loading Expo fetch until the baseline transport measurements end.
      const expoFetch = require("expo/fetch").fetch;
      setState("Checking expo-strict");
      reports.push(
        await runBoundaryCases(
          sdk,
          expoFetch,
          origin,
          `${Platform.OS}-expo-strict`,
          true,
        ),
      );
      const result = {
        runtime: {
          platform: Platform.OS,
          version: Platform.Version,
          react: React.version,
          reactNative: Platform.constants.reactNativeVersion,
          hermes: typeof globalThis.HermesInternal !== "undefined",
          ambientIsXhr: ambientFetch === xhrFetch,
          ambientIsExpo: ambientFetch === expoFetch,
        },
        reports,
      };
      const receipt = await ambientFetch(`${origin}/result`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(result),
      });
      if (!receipt.ok) throw new Error("Result receipt failed");
      const last = reports.at(-1);
      if (
        last.summary.followed !== 0 ||
        last.summary.rejected !== 50 ||
        !last.cookie.controlPresent ||
        last.cookie.sourceReceived
      )
        throw new Error("Expo strict boundary not proven");
      setState("Recorded 224 cases; strict Expo boundary passed");
    } catch (error) {
      setState(`Failed: ${error.message}`);
      await ambientFetch(`${origin}/result`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ failed: String(error.message), reports }),
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
        Daykeeper synthetic network boundary fixture
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
        <Text style={{ color: "#ffffff" }}>Run synthetic boundary checks</Text>
      </Pressable>
    </View>
  );
}

AppRegistry.registerComponent("main", () => Fixture);
