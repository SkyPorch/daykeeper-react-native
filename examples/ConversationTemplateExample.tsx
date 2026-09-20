import { useState } from "react";
import { Button, Text, TextInput, View } from "react-native";

import { DaykeeperConversationTemplate } from "@skyporch/daykeeper-react-native/ui";

export function ConversationTemplateExample() {
  const [messages, setMessages] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

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
        <View accessibilityLabel="Message composer">
          <TextInput
            accessibilityLabel="Message"
            onChangeText={setDraft}
            onSubmitEditing={send}
            placeholder="Write a message"
            returnKeyType="send"
            value={draft}
          />
          <Button onPress={send} title="Send" />
        </View>
      }
    >
      {messages.map((message, index) => (
        <Text key={`${index}-${message}`}>{message}</Text>
      ))}
    </DaykeeperConversationTemplate>
  );
}
