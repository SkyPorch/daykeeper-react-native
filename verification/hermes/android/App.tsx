import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { createDaykeeperReactNativeClient } from "@skyporch/daykeeper-react-native";
import { createFixtureFetch, FIXTURE_BASE_URL } from "./fixture";

const MARKER = "DAYKEEPER_HERMES_SMOKE_OK";

export default function App() {
  const [status, setStatus] = useState("running");
  useEffect(() => {
    let networkCalled = false;
    const nativeFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      networkCalled = true;
      throw new Error("native fetch was called");
    }) as typeof fetch;
    const fixture = createFixtureFetch();
    const client = createDaykeeperReactNativeClient({
      baseUrl: FIXTURE_BASE_URL,
      getAccessToken: () => "fixture-access-token",
      fetch: fixture.fetch,
      timeoutMs: 5_000,
    });
    void (async () => {
      const identity = await client.getIdentity();
      const conversations = await client.listConversations();
      const unread = await client.getUnread();
      if (
        networkCalled ||
        typeof (globalThis as typeof globalThis & { HermesInternal?: unknown })
          .HermesInternal === "undefined" ||
        identity.subject !== "fixture-subject" ||
        conversations.conversations.length !== 0 ||
        unread.unreadCount !== 0 ||
        fixture.calls.length !== 3 ||
        fixture.calls.some(
          (call) =>
            call.method !== "GET" ||
            call.authorization !== "Bearer fixture-access-token",
        )
      )
        throw new Error("Hermes fixture assertion failed");
      console.log(MARKER);
      setStatus(MARKER);
    })().catch(() => setStatus("FAILED"));
    return () => {
      globalThis.fetch = nativeFetch;
    };
  }, []);
  return (
    <View>
      <Text>{status}</Text>
    </View>
  );
}
