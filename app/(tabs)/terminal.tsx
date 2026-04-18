import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Keyboard,
} from "react-native";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAppStore } from "@/lib/store";
import { sshService } from "@/lib/ssh-service";

interface TerminalLine {
  id: string;
  text: string;
  timestamp: number;
}

// Global shell state — persists across tab switches
let globalShellWrite: ((data: string) => void) | null = null;
let globalShellLines: TerminalLine[] = [];
let globalShellListeners: Array<(lines: TerminalLine[]) => void> = [];

function notifyListeners() {
  globalShellListeners.forEach((fn) => fn([...globalShellLines]));
}

// Remove ANSI escape sequences and control characters
function cleanAnsiText(text: string): string {
  return text
    // Remove ANSI escape sequences (colors, cursor movement, etc.)
    .replace(/\x1b\[[^m]*m/g, '')
    .replace(/\x1b\[\?[0-9]+[a-zA-Z]/g, '')
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    // Remove other control characters except newline/carriage return
    .replace(/[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]/g, '')
    .trim();
}

function addLine(text: string) {
  const cleaned = cleanAnsiText(text);
  if (!cleaned) return; // Skip empty lines
  
  const chunks = cleaned.split(/\r?\n/);
  for (const chunk of chunks) {
    if (chunk.length > 0 || chunks.length === 1) {
      globalShellLines.push({
        id: `${Date.now()}-${Math.random()}`,
        text: chunk,
        timestamp: Date.now(),
      });
    }
  }
  // Keep last 1000 lines
  if (globalShellLines.length > 1000) {
    globalShellLines = globalShellLines.slice(-1000);
  }
  notifyListeners();
}

export default function TerminalScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { connectionStatus } = useAppStore();
  const [lines, setLines] = useState<TerminalLine[]>([...globalShellLines]);
  const [input, setInput] = useState("");
  const [shellReady, setShellReady] = useState(!!globalShellWrite);
  const [shellError, setShellError] = useState<string | null>(null);
  const [openingShell, setOpeningShell] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [commandExecuting, setCommandExecuting] = useState(false);
  const scrollRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const isConnected = connectionStatus === "connected";

  // Listen for keyboard show/hide — track actual keyboard height
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardHeight(0)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Subscribe to global shell lines
  useEffect(() => {
    const listener = (newLines: TerminalLine[]) => {
      setLines(newLines);
    };
    globalShellListeners.push(listener);
    return () => {
      globalShellListeners = globalShellListeners.filter((l) => l !== listener);
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (lines.length > 0) {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd?.({ animated: true });
      }, 50);
    }
  }, [lines]);

  // Open shell when connected (if not already open)
  useEffect(() => {
    if (isConnected && !globalShellWrite) {
      openShell();
    }
    if (!isConnected) {
      globalShellWrite = null;
      setShellReady(false);
    }
  }, [isConnected]);

  const openShell = useCallback(async () => {
    if (!sshService.isConnected) return;
    setOpeningShell(true);
    setShellError(null);
    try {
      const write = await sshService.openShell(
        (data) => {
          addLine(data);
        },
        () => {
          globalShellWrite = null;
          setShellReady(false);
          addLine("\r\n[会话已关闭]");
        }
      );
      globalShellWrite = write;
      setShellReady(true);
      setShellError(null);
    } catch (err: any) {
      setShellError(err.message);
      addLine(`\r\n[Shell 错误: ${err.message}]`);
    } finally {
      setOpeningShell(false);
    }
  }, []);

  const sendInput = () => {
    if (!globalShellWrite || !input.trim()) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setCommandExecuting(true);
    globalShellWrite(input + "\n");
    setInput("");
    setTimeout(() => {
      setCommandExecuting(false);
    }, 3000);
  };

  const sendSpecial = (key: string) => {
    if (!globalShellWrite) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    globalShellWrite(key);
  };

  const clearScreen = () => {
    globalShellLines = [];
    notifyListeners();
    if (globalShellWrite) {
      globalShellWrite("\x0c"); // Ctrl+L
    }
  };

  const renderLine = ({ item }: { item: TerminalLine }) => (
    <Text key={item.id} style={styles.termLine} selectable>
      {item.text}
    </Text>
  );

  // Calculate bottom padding: when keyboard is visible, add extra space for toolbar+input
  const bottomPad = keyboardHeight > 0 ? 0 : Math.max(insets.bottom, 8);

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]} containerClassName="flex-1">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {t("terminal.title")}
          </Text>
          <View style={styles.headerRight}>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: shellReady
                    ? colors.success + "22"
                    : shellError
                    ? colors.error + "22"
                    : colors.muted + "22",
                  borderColor: shellReady ? colors.success : shellError ? colors.error : colors.muted,
                },
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: shellReady ? colors.success : shellError ? colors.error : colors.muted },
                ]}
              />
              <Text
                style={[
                  styles.statusText,
                  { color: shellReady ? colors.success : shellError ? colors.error : colors.muted },
                ]}
              >
                {openingShell
                  ? "连接中..."
                  : shellReady
                  ? t("terminal.sessionRunning")
                  : shellError
                  ? "Shell 错误"
                  : t("terminal.disconnected")}
              </Text>
            </View>
            {isConnected && !shellReady && !openingShell && (
              <TouchableOpacity
                style={[styles.iconBtn, { backgroundColor: colors.primary + "22", borderRadius: 8 }]}
                onPress={openShell}
              >
                <IconSymbol name="arrow.clockwise" size={18} color={colors.primary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={clearScreen} style={styles.iconBtn}>
              <IconSymbol name="close" size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Shell error banner */}
        {isConnected && shellError && !shellReady && (
          <View style={styles.errorBanner}>
            <IconSymbol name="exclamationmark.triangle.fill" size={16} color="#F87171" />
            <Text style={styles.errorText} numberOfLines={2}>
              {shellError}
            </Text>
            <TouchableOpacity style={styles.retryBtn} onPress={openShell}>
              <Text style={styles.retryBtnText}>重试</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Terminal Output — bright green text on dark background */}
        <View style={[styles.terminal, { flex: 1 }]}>
          {!isConnected ? (
            <View style={styles.notConnected}>
              <IconSymbol name="terminal" size={40} color="#6B7280" />
              <Text style={styles.notConnectedText}>
                {t("terminal.disconnected")}
              </Text>
            </View>
          ) : (
            <FlatList
              ref={scrollRef}
              data={lines}
              renderItem={renderLine}
              keyExtractor={(item) => item.id}
              style={styles.termScroll}
              contentContainerStyle={styles.termContent}
              onContentSizeChange={() =>
                scrollRef.current?.scrollToEnd({ animated: false })
              }
              removeClippedSubviews
              maxToRenderPerBatch={50}
              windowSize={10}
              ListFooterComponent={
                commandExecuting ? (
                  <View style={styles.executingIndicator}>
                    <View style={styles.spinner} />
                    <Text style={styles.executingIndicatorText}>等待命令完成...</Text>
                  </View>
                ) : null
              }
            />
          )}
        </View>

        {/* Keyboard Toolbar + Input Row — flex layout to ensure both visible */}
        {isConnected && (
          <View style={{ flexShrink: 0, backgroundColor: "#161922" }}>
            {/* Toolbar */}
            <View style={[styles.toolbar, { borderTopColor: colors.border }]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {[
                  { label: "Tab", key: "\t" },
                  { label: "Ctrl+C", key: "\x03" },
                  { label: "Ctrl+D", key: "\x04" },
                  { label: "Ctrl+Z", key: "\x1a" },
                  { label: "↑", key: "\x1b[A" },
                  { label: "↓", key: "\x1b[B" },
                  { label: "←", key: "\x1b[D" },
                  { label: "→", key: "\x1b[C" },
                  { label: "Esc", key: "\x1b" },
                  { label: "Home", key: "\x1b[H" },
                  { label: "End", key: "\x1b[F" },
                ].map((btn) => (
                  <TouchableOpacity
                    key={btn.label}
                    style={styles.toolbarBtn}
                    onPress={() => sendSpecial(btn.key)}
                  >
                    <Text style={styles.toolbarBtnText}>{btn.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Input Row */}
            <View
              style={[
                styles.inputRowContainer,
                { 
                  paddingBottom: Math.max(insets.bottom, 8),
                  backgroundColor: "#161922",
                },
              ]}
            >
              <View style={styles.inputRow}>
                <Text style={styles.prompt}>$</Text>
                <TextInput
                  ref={inputRef}
                  style={[styles.input, { backgroundColor: colors.surface2 || "#0F1117" }]}
                  value={input}
                  onChangeText={setInput}
                  onSubmitEditing={sendInput}
                  returnKeyType="send"
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  placeholder="输入命令..."
                  placeholderTextColor="#6B7280"
                  blurOnSubmit={false}
                />
                <TouchableOpacity style={styles.sendBtn} onPress={sendInput}>
                  <IconSymbol name="paperplane.fill" size={18} color="#0F1117" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  errorBanner: {
    backgroundColor: "#2D0000",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  errorText: {
    color: "#F87171",
    fontSize: 12,
    flex: 1,
  },
  retryBtn: {
    backgroundColor: "#F87171",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  retryBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  terminal: {
    flex: 1,
    backgroundColor: "#0F1117",
  },
  termScroll: {
    flex: 1,
  },
  termContent: {
    padding: 12,
    paddingBottom: 20,
  },
  termLine: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 13,
    lineHeight: 20,
    color: "#FFFFFF", // White text on dark background
  },
  notConnected: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  notConnectedText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#6B7280",
  },
  toolbar: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: 0.5,
    borderTopColor: "#1E2530",
    backgroundColor: "#161922",
  },
  toolbarBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2D3748",
    backgroundColor: "#1E2530",
    marginRight: 6,
    minWidth: 44,
    alignItems: "center",
  },
  toolbarBtnText: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: "#E5E7EB",
  },
  inputRowContainer: {
    borderTopWidth: 0.5,
    borderTopColor: "#1E2530",
    backgroundColor: "#161922",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  prompt: {
    fontSize: 16,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: "#FFFFFF",
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    paddingVertical: 8,
    paddingHorizontal: 4,
    color: "#F3F4F6", // Light gray text — clearly visible on dark background
    backgroundColor: "#0F1117",
    borderRadius: 6,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  executingIndicator: {
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "#1E2530",
    borderRadius: 6,
    marginTop: 8,
  },
  spinner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#10B981",
    borderTopColor: "transparent",
  },
  executingIndicatorText: {
    fontSize: 12,
    color: "#10B981",
    fontWeight: "600",
  },
});
