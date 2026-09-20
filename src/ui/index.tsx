import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";

export const DEFAULT_CONVERSATION_STARTER_TOPICS = [
  "Getting started",
  "Account help",
  "Something else",
] as const;

export type DaykeeperConversationTemplateProps = {
  teamName?: string;
  greeting?: string;
  body?: string;
  accentColor?: string;
  accentTextColor?: string;
  starterTopics?: readonly string[];
  onStarterTopicPress?: (topic: string) => void;
  draft?: string;
  onDraftChange?: (draft: string) => void;
  onSend?: (message: string) => void;
  sending?: boolean;
  composerPlaceholder?: string;
  sendLabel?: string;
  sendingLabel?: string;
  /** Hide the welcome intro when rendering an older, already-active history. */
  hideWelcome?: boolean;
  accessibilityLabels?: {
    conversation?: string;
    conversationStatus?: string;
    starterTopics?: string;
    messageComposer?: string;
    messageInput?: string;
    sendButton?: string;
  };
  keyboardVerticalOffset?: number;
  children?: ReactNode;
  composer?: ReactNode;
};

/**
 * A presentational conversation surface. It owns no client, session, network,
 * online state, or response promises; the host owns those concerns.
 */
export function DaykeeperConversationTemplate({
  teamName = "Support team",
  greeting = "How can we help?",
  body = "Send a message to our team. Replies will appear here.",
  accentColor,
  accentTextColor,
  starterTopics = DEFAULT_CONVERSATION_STARTER_TOPICS,
  onStarterTopicPress,
  draft = "",
  onDraftChange,
  onSend,
  sending = false,
  composerPlaceholder = "Write a message",
  sendLabel = "Send",
  sendingLabel = "Sending…",
  hideWelcome = false,
  accessibilityLabels,
  keyboardVerticalOffset = 0,
  children,
  composer,
}: DaykeeperConversationTemplateProps) {
  const dark = useColorScheme() === "dark";
  const colors = {
    ...(dark ? darkColors : lightColors),
    accent: accentColor ?? (dark ? darkColors.accent : lightColors.accent),
  };
  const topicHandler = onStarterTopicPress ?? onDraftChange;
  const composerContent =
    composer === null
      ? null
      : (composer ?? (
          <BuiltInComposer
            accentTextColor={accentTextColor}
            accessibilityLabels={accessibilityLabels}
            colors={colors}
            draft={draft}
            onDraftChange={onDraftChange}
            onSend={onSend}
            placeholder={composerPlaceholder}
            sending={sending}
            sendingLabel={sendingLabel}
            sendLabel={sendLabel}
          />
        ));

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={keyboardVerticalOffset}
        style={styles.container}
      >
        <View style={styles.header}>
          <View
            style={[styles.avatar, { backgroundColor: colors.accent }]}
            accessible={false}
          >
            <Text
              style={[
                styles.avatarText,
                { color: accentTextColor ?? (dark ? "#171722" : "#FFFFFF") },
              ]}
            >
              {teamName.trim().slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={styles.headerCopy}>
            <Text style={[styles.teamName, { color: colors.primary }]}>
              {teamName}
            </Text>
            <Text style={[styles.status, { color: colors.secondary }]}>
              {accessibilityLabels?.conversationStatus ?? "Conversation"}
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          accessibilityLabel={
            accessibilityLabels?.conversation ?? "Conversation"
          }
        >
          {!hideWelcome ? (
            <View style={styles.welcome}>
              <Text style={[styles.greeting, { color: colors.primary }]}>
                {greeting}
              </Text>
              <Text style={[styles.body, { color: colors.secondary }]}>
                {body}
              </Text>
              {starterTopics.length > 0 && topicHandler ? (
                <View
                  style={styles.topicList}
                  accessibilityLabel={
                    accessibilityLabels?.starterTopics ?? "Starter topics"
                  }
                >
                  {starterTopics.map((topic, index) => (
                    <Pressable
                      key={`${topic}-${index}`}
                      accessibilityRole="button"
                      accessibilityLabel={topic}
                      accessibilityState={{
                        disabled: !topicHandler || sending,
                      }}
                      disabled={!topicHandler || sending}
                      onPress={() => topicHandler(topic)}
                      style={({ pressed }) => [
                        styles.topic,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.card,
                        },
                        pressed && styles.topicPressed,
                      ]}
                    >
                      <Text
                        style={[styles.topicText, { color: colors.primary }]}
                      >
                        {topic}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
          {children}
        </ScrollView>

        {composerContent ? (
          <View
            accessibilityLabel={
              accessibilityLabels?.messageComposer ?? "Message composer"
            }
            style={[styles.composer, { borderTopColor: colors.border }]}
          >
            {composerContent}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type BuiltInComposerProps = {
  colors: typeof lightColors;
  accentTextColor?: string;
  accessibilityLabels?: DaykeeperConversationTemplateProps["accessibilityLabels"];
  draft: string;
  onDraftChange?: (draft: string) => void;
  onSend?: (message: string) => void;
  placeholder: string;
  sending: boolean;
  sendingLabel: string;
  sendLabel: string;
};

function BuiltInComposer({
  accentTextColor,
  accessibilityLabels,
  colors,
  draft,
  onDraftChange,
  onSend,
  placeholder,
  sending,
  sendingLabel,
  sendLabel,
}: BuiltInComposerProps) {
  const disabled =
    sending || !onDraftChange || !onSend || draft.trim().length === 0;
  return (
    <View style={styles.composerRow}>
      <TextInput
        accessibilityLabel={accessibilityLabels?.messageInput ?? "Message"}
        editable={!sending && Boolean(onDraftChange)}
        multiline
        onChangeText={onDraftChange}
        onSubmitEditing={() => {
          if (!disabled) onSend(draft.trim());
        }}
        placeholder={placeholder}
        placeholderTextColor={colors.secondary}
        style={[
          styles.input,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            color: colors.primary,
          },
        ]}
        value={draft}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabels?.sendButton ?? sendLabel}
        accessibilityState={{ disabled, busy: sending }}
        disabled={disabled}
        onPress={() => onSend?.(draft.trim())}
        style={({ pressed }) => [
          styles.sendButton,
          { backgroundColor: colors.accent },
          disabled && styles.sendButtonDisabled,
          pressed && styles.topicPressed,
        ]}
      >
        <Text
          style={[
            styles.sendText,
            {
              color:
                accentTextColor ??
                (colors.accent === darkColors.accent ? "#171722" : "#FFFFFF"),
            },
          ]}
        >
          {sending ? sendingLabel : sendLabel}
        </Text>
      </Pressable>
    </View>
  );
}

const lightColors = {
  accent: "#635BFF",
  background: "#F7F7FB",
  card: "#FFFFFF",
  border: "#E1E1EA",
  primary: "#171722",
  secondary: "#656577",
};

const darkColors = {
  accent: "#A9A3FF",
  background: "#111118",
  card: "#1D1D28",
  border: "#343444",
  primary: "#F5F5FA",
  secondary: "#B4B4C4",
};

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  avatar: {
    alignItems: "center",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  avatarText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  headerCopy: { flex: 1 },
  teamName: { fontSize: 17, fontWeight: "700" },
  status: { fontSize: 13, marginTop: 2 },
  scrollContent: { flexGrow: 1, padding: 20 },
  welcome: { marginTop: "18%", maxWidth: 520, width: "100%" },
  greeting: {
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  body: { fontSize: 16, lineHeight: 24, marginTop: 12 },
  topicList: { gap: 10, marginTop: 24 },
  topic: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  topicPressed: { opacity: 0.7 },
  topicText: { fontSize: 15, fontWeight: "600" },
  composer: { borderTopWidth: 1, padding: 12 },
  composerRow: { alignItems: "flex-end", flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sendButton: {
    alignItems: "center",
    alignSelf: "flex-end",
    borderRadius: 10,
    minWidth: 72,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendButtonDisabled: { opacity: 0.45 },
  sendText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
});
