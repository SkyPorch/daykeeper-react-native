# Quickstart

A minimal React Native screen that lists a signed-in customer's conversations.

## Configure

Two environment values are read at build time through your bundler's env
support (`app.config.ts` `extra`, `react-native-config`, or `EXPO_PUBLIC_*`):

- `DAYKEEPER_API_URL` — the exact HTTPS gateway URL, with no redirect.
- `DAYKEEPER_CUSTOMER_TOKEN` — a short-lived, customer-scoped token. In
  production, mint this per request from your own backend instead of shipping
  it in the app; this quickstart reads it from the environment so the example
  runs end to end.

## Example

```tsx
import { useEffect, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { fetch as expoFetch } from "expo/fetch";
import { createDaykeeperReactNativeClient } from "@skyporch/daykeeper-react-native";

const daykeeper = createDaykeeperReactNativeClient({
  baseUrl: process.env.DAYKEEPER_API_URL!,
  fetch: expoFetch,
  getAccessToken: async () => process.env.DAYKEEPER_CUSTOMER_TOKEN!,
});

export function ConversationsScreen() {
  const [items, setItems] = useState<{ id: number }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    daykeeper
      .listConversations({ signal: controller.signal })
      .then((result) => setItems(result.conversations))
      .catch((cause) => setError(String(cause)));
    return () => controller.abort();
  }, []);

  if (error) return <Text>{error}</Text>;
  return (
    <View>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <Text>Conversation #{item.id}</Text>}
      />
    </View>
  );
}
```

The native export requires an explicit Fetch implementation; the React Native
XHR-backed global is not compliant. See [`../COMPATIBILITY.md`](../COMPATIBILITY.md)
for the transport contract and [`../README.md`](../README.md) for token rotation.
