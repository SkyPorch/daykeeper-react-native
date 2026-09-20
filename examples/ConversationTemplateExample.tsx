import { useState } from "react";
import { Button, Text, TextInput, useColorScheme, View } from "react-native";

import { DaykeeperConversationTemplate } from "@skyporch/daykeeper-react-native/ui";

export function ConversationTemplateExample() {
  const [messages, setMessages] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const dark = useColorScheme() === "dark";
  const colors = {
    background: dark ? "#111118" : "#FFFFFF",
    input: dark ? "#F5F5FA" : "#171722",
    placeholder: dark ? "#B4B4C4" : "#656577",
  };

  function send() {
    const message = draft.trim();
    if (!message) return;
    setMessages((current) => [...current, message]);
    setDraft("");
  }

  return (
    <DaykeeperConversationTemplate
      teamName="Support team"
      greeting="How can we help?"
      body="Send a message to our team. Replies will appear here."
      starterTopics={["Getting started", "Account help"]}
      onStarterTopicPress={setDraft}
      composer={
        <View
          accessibilityLabel="Message composer"
          style={{ backgroundColor: colors.background }}
        >
          <TextInput
            accessibilityLabel="Message"
            onChangeText={setDraft}
            onSubmitEditing={send}
            placeholder="Write a message"
            placeholderTextColor={colors.placeholder}
            returnKeyType="send"
            style={{ color: colors.input }}
            value={draft}
          />
          <Button onPress={send} title="Send" />
        </View>
      }
    >
      {messages.map((message, index) => (
        <View
          accessible
          accessibilityLabel={`Outgoing message ${index + 1}`}
          key={`${index}-${message}`}
        >
          <Text style={{ color: colors.input }}>{message}</Text>
        </View>
      ))}
    </DaykeeperConversationTemplate>
  );
}
