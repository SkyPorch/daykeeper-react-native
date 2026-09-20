import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";

export type DaykeeperConversationTemplateProps = {
  teamName?: string;
  greeting?: string;
  body?: string;
  accentColor?: string;
  accentTextColor?: string;
  starterTopics?: readonly string[];
  onStarterTopicPress?: (topic: string) => void;
  /** Hide the welcome intro when rendering an older, already-active history. */
  hideWelcome?: boolean;
  accessibilityLabels?: {
    conversation?: string;
    conversationStatus?: string;
    starterTopics?: string;
    messageComposer?: string;
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
  starterTopics = [],
  onStarterTopicPress,
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
              {starterTopics.length > 0 ? (
                <View
                  style={styles.topicList}
                  accessibilityLabel={
                    accessibilityLabels?.starterTopics ?? "Starter topics"
                  }
                >
                  {starterTopics.map((topic, index) => (
                    <Pressable
                      key={`${topic}-${index}`}
                      accessibilityRole={
                        onStarterTopicPress ? "button" : undefined
                      }
                      accessibilityLabel={topic}
                      disabled={!onStarterTopicPress}
                      onPress={() => onStarterTopicPress?.(topic)}
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

        {composer ? (
          <View
            accessibilityLabel={
              accessibilityLabels?.messageComposer ?? "Message composer"
            }
            style={[styles.composer, { borderTopColor: colors.border }]}
          >
            {composer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
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
});
