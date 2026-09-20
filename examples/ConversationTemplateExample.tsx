import { useState } from "react";
import { Text, useColorScheme, View } from "react-native";

import { DaykeeperConversationTemplate } from "@skyporch/daykeeper-react-native/ui";

export function ConversationTemplateExample() {
  const [messages, setMessages] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const dark = useColorScheme() === "dark";
  const messageColor = dark ? "#F5F5FA" : "#171722";

  function send() {
    const message = draft.trim();
    if (!message) return;
    setMessages((current) => [...current, message]);
    setDraft("");
  }

  return (
    <DaykeeperConversationTemplate
      draft={draft}
      onDraftChange={setDraft}
      onSend={send}
    >
      {messages.map((message, index) => (
        <View
          accessible
          accessibilityLabel={`You: ${message}`}
          key={`${index}-${message}`}
        >
          <Text style={{ color: messageColor }}>{message}</Text>
        </View>
      ))}
    </DaykeeperConversationTemplate>
  );
}
