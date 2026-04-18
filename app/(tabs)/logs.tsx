import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
} from "react-native";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAppStore } from "@/lib/store";
import { sshService } from "@/lib/ssh-service";
import { analyzeLog } from "@/lib/ai-service";

// ─── Types ────────────────────────────────────────────────────────────────────

type LogLevel = "all" | "error" | "warn" | "info" | "debug";

interface LogLine {
  id: string;
  text: string;
  level: LogLevel;
  timestamp: number;
}

function detectLevel(text: string): LogLevel {
  const lower = text.toLowerCase();
  if (lower.includes("error") || lower.includes("critical") || lower.includes("fatal"))
    return "error";
  if (lower.includes("warn") || lower.includes("warning")) return "warn";
  if (lower.includes("debug") || lower.includes("verbose")) return "debug";
  return "info";
}

function levelColor(level: LogLevel, colors: any): string {
  switch (level) {
    case "error": return colors.error;
    case "warn": return colors.warning;
    case "debug": return colors.muted;
    default: return colors.foreground;
  }
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function LogsScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const { connectionStatus, aiApiKey } = useAppStore();
  const isConnected = connectionStatus === "connected";

  const [lines, setLines] = useState<LogLine[]>([]);
  const [filter, setFilter] = useState<LogLevel>("all");
  const [streaming, setStreaming] = useState(false);
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [applyingFix, setApplyingFix] = useState(false);
  
  // AI 分析对话界面
  const [aiAnalysisMode, setAiAnalysisMode] = useState<"select" | "custom" | "result">("select");
  const [aiCustomPrompt, setAiCustomPrompt] = useState("");

  const stopStreamRef = useRef<(() => void) | null>(null);
  const listRef = useRef<FlatList>(null);

  const addLine = useCallback((text: string) => {
    const level = detectLevel(text);
    const line: LogLine = {
      id: `${Date.now()}-${Math.random()}`,
      text,
      level,
      timestamp: Date.now(),
    };
    setLines((prev) => {
      const updated = [...prev, line];
      return updated.length > 2000 ? updated.slice(-2000) : updated;
    });
  }, []);

  const startStreaming = async () => {
    if (!sshService.isConnected) return;
    try {
      const stop = await sshService.streamLogs(addLine, (err) => {
        console.warn("Log stream error:", err);
        setStreaming(false);
      });
      stopStreamRef.current = stop;
      setStreaming(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || t("common.failed"));
    }
  };

  const stopStreaming = () => {
    if (stopStreamRef.current) {
      stopStreamRef.current();
      stopStreamRef.current = null;
    }
    setStreaming(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  useEffect(() => {
    return () => {
      if (stopStreamRef.current) stopStreamRef.current();
    };
  }, []);

  useEffect(() => {
    if (!isConnected && streaming) {
      stopStreaming();
    }
  }, [isConnected]);

  useEffect(() => {
    if (streaming && lines.length > 0) {
      setTimeout(() => {
        listRef.current?.scrollToEnd?.({ animated: false });
      }, 50);
    }
  }, [lines, streaming]);

  const clearLogs = () => {
    setLines([]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const saveLog = async () => {
    const content = lines.map((l) => l.text).join("\n");
    if (sshService.isConnected) {
      try {
        const remotePath = `/tmp/log_${Date.now()}.txt`;
        await sshService.writeFile(remotePath, content);
        Alert.alert(t("common.success"), `${t("logs.saved")}\n${remotePath}`);
      } catch (err: any) {
        Alert.alert(t("common.error"), err.message || t("common.failed"));
      }
    } else {
      Alert.alert(t("common.error"), t("device.notConnected"));
    }
  };

  const handleAiAnalyze = async (type: "error" | "analyze" | "optimize" | "custom") => {
    const errorLines = lines.filter((l) => l.level === "error" || l.level === "warn");
    const content = (errorLines.length > 0 ? errorLines : lines)
      .slice(-200)
      .map((l) => l.text)
      .join("\n");

    if (!content) {
      Alert.alert(t("common.error"), t("logs.noLogs"));
      return;
    }

    setAiLoading(true);
    setAiResult(null);
    setAiAnalysisMode("result");

    try {
      let prompt = content;
      if (type === "error") {
        prompt = `请分析这些日志中的错误，找出根本原因并提供修复建议:\n\n${content}`;
      } else if (type === "analyze") {
        prompt = `请详细分析这些日志，解释发生了什么:\n\n${content}`;
      } else if (type === "optimize") {
        prompt = `请分析这些日志，找出可以优化的地方:\n\n${content}`;
      } else if (type === "custom" && aiCustomPrompt) {
        prompt = `${aiCustomPrompt}\n\n日志内容:\n${content}`;
      }

      const result = await analyzeLog(prompt, aiApiKey || undefined);
      setAiResult(result);
    } catch (err: any) {
      const errorMsg = err.message || t("common.failed");
      const friendlyMsg = errorMsg.includes("connection") || errorMsg.includes("timeout")
        ? t("logs.analysisFailed")
        : errorMsg;
      setAiResult({ summary: friendlyMsg, suggestions: [] });
    } finally {
      setAiLoading(false);
    }
  };

  const handleApplyFix = async (command: string) => {
    if (!sshService.isConnected) {
      Alert.alert(t("common.error"), t("device.notConnected"));
      return;
    }
    setApplyingFix(true);
    try {
      const result = await sshService.exec(command);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(t("logs.fixApplied"), result || t("common.success"));
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message);
    } finally {
      setApplyingFix(false);
    }
  };

  const filteredLines = filter === "all" ? lines : lines.filter((l) => l.level === filter);

  const renderLine = ({ item }: { item: LogLine }) => (
    <View style={[styles.logLine, { backgroundColor: colors.surface2 }]}>
      <Text style={[styles.logTime, { color: colors.muted }]}>
        {new Date(item.timestamp).toLocaleTimeString()}
      </Text>
      <Text
        style={[styles.logText, { color: levelColor(item.level, colors) }]}
        selectable
        numberOfLines={3}
      >
        {item.text}
      </Text>
    </View>
  );

  return (
    <ScreenContainer className="flex-1">
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t("logs.title")}</Text>
          <View
            style={[
              styles.filterGroup,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            {(["all", "error", "warn", "info", "debug"] as LogLevel[]).map((f) => {
              const filterLabels: Record<LogLevel, string> = {
                all: t("logs.filterAll"),
                error: t("logs.filterError"),
                warn: t("logs.filterWarn"),
                info: t("logs.filterInfo"),
                debug: t("logs.filterDebug"),
              };
              return (
                <TouchableOpacity
                  key={f}
                  style={[
                    styles.filterBtn,
                    filter === f && { backgroundColor: colors.primary },
                  ]}
                  onPress={() => setFilter(f)}
                >
                  <Text
                    style={[
                      styles.filterText,
                      { color: filter === f ? "#0D1117" : colors.muted },
                    ]}
                  >
                    {filterLabels[f]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={clearLogs} style={styles.iconBtn}>
            <IconSymbol name="trash" size={20} color={colors.muted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={saveLog} style={styles.iconBtn}>
            <IconSymbol name="arrow.down.doc" size={20} color={colors.muted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Log Output */}
      <View style={[styles.logContainer, { backgroundColor: colors.surface2 }]}>
        {!isConnected ? (
          <View style={styles.empty}>
            <IconSymbol name="wifi.slash" size={40} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.muted }]}>{t("device.notConnected")}</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={filteredLines}
            renderItem={renderLine}
            keyExtractor={(item) => item.id}
            style={{ backgroundColor: colors.surface2 }}
            contentContainerStyle={[styles.logContent, { backgroundColor: colors.surface2 }]}
            onContentSizeChange={() =>
              streaming && listRef.current?.scrollToEnd({ animated: false })
            }
            removeClippedSubviews
            maxToRenderPerBatch={50}
            windowSize={10}
          />
        )}
      </View>

      {/* Start/Stop Button + AI Button */}
      {isConnected && (
        <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[
              styles.streamBtn,
              { backgroundColor: streaming ? colors.error : colors.success },
            ]}
            onPress={streaming ? stopStreaming : startStreaming}
          >
            <IconSymbol name={streaming ? "stop.fill" : "play.fill"} size={20} color="#0D1117" />
            <Text style={styles.streamBtnText}>
              {streaming ? t("logs.stop") : t("logs.start")}
            </Text>
          </TouchableOpacity>
          {lines.length > 0 && (
            <TouchableOpacity
              style={[styles.aiBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                setAiAnalysisMode("select");
                setAiModalVisible(true);
              }}
            >
              <IconSymbol name="sparkles" size={18} color="#0D1117" />
              <Text style={styles.aiBtnText}>AI 分析</Text>
            </TouchableOpacity>
          )}
          {streaming && (
            <View style={styles.streamingIndicator}>
              <ActivityIndicator size="small" color={colors.success} />
              <Text style={[styles.streamingText, { color: colors.success }]}>
                {lines.length} lines
              </Text>
            </View>
          )}
        </View>
      )}

      {/* AI Analysis Modal */}
      <Modal
        visible={aiModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAiModalVisible(false)}
      >
        <View style={[{ flex: 1, backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>AI 分析</Text>
            <TouchableOpacity onPress={() => setAiModalVisible(false)}>
              <IconSymbol name="close" size={24} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {/* Mode: Select Analysis Type */}
          {aiAnalysisMode === "select" && !aiLoading && (
            <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.aiSelectContent, { backgroundColor: colors.background }]}>
              <Text style={[styles.aiSelectTitle, { color: colors.foreground }]}>
                请选择分析类型
              </Text>
              <TouchableOpacity
                style={[styles.aiOption, { backgroundColor: colors.surface }]}
                onPress={() => handleAiAnalyze("error")}
              >
                <IconSymbol name="exclamationmark.circle" size={24} color="#FF6B6B" />
                <View style={styles.aiOptionText}>
                  <Text style={[styles.aiOptionTitle, { color: colors.foreground }]}>
                    查找错误
                  </Text>
                  <Text style={[styles.aiOptionDesc, { color: colors.muted }]}>
                    分析日志中的错误，找出根本原因
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.aiOption, { backgroundColor: colors.surface }]}
                onPress={() => handleAiAnalyze("analyze")}
              >
                <IconSymbol name="magnifyingglass" size={24} color={colors.primary} />
                <View style={styles.aiOptionText}>
                  <Text style={[styles.aiOptionTitle, { color: colors.foreground }]}>
                    详细分析
                  </Text>
                  <Text style={[styles.aiOptionDesc, { color: colors.muted }]}>
                    详细解释日志中发生了什么
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.aiOption, { backgroundColor: colors.surface }]}
                onPress={() => handleAiAnalyze("optimize")}
              >
                <IconSymbol name="bolt" size={24} color="#FFD93D" />
                <View style={styles.aiOptionText}>
                  <Text style={[styles.aiOptionTitle, { color: colors.foreground }]}>
                    优化建议
                  </Text>
                  <Text style={[styles.aiOptionDesc, { color: colors.muted }]}>
                    找出可以优化的地方
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.aiOption, { backgroundColor: colors.surface }]}
                onPress={() => setAiAnalysisMode("custom")}
              >
                <IconSymbol name="pencil" size={24} color={colors.muted} />
                <View style={styles.aiOptionText}>
                  <Text style={[styles.aiOptionTitle, { color: colors.foreground }]}>
                    自定义提问
                  </Text>
                  <Text style={[styles.aiOptionDesc, { color: colors.muted }]}>
                    输入您的问题或需求
                  </Text>
                </View>
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* Mode: Custom Prompt */}
          {aiAnalysisMode === "custom" && !aiLoading && (
            <View style={styles.aiCustomContent}>
              <Text style={[styles.aiCustomLabel, { color: colors.foreground }]}>
                请输入您的问题或需求
              </Text>
              <TextInput
                style={[
                  styles.aiCustomInput,
                  { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border },
                ]}
                placeholder="例如：这个错误会导致什么后果？"
                placeholderTextColor={colors.muted}
                value={aiCustomPrompt}
                onChangeText={setAiCustomPrompt}
                multiline
                numberOfLines={4}
              />
              <View style={styles.aiCustomButtons}>
                <TouchableOpacity
                  style={[styles.aiCustomBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => setAiAnalysisMode("select")}
                >
                  <Text style={[styles.aiCustomBtnText, { color: colors.foreground }]}>返回</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.aiCustomBtn, { backgroundColor: colors.primary }]}
                  onPress={() => handleAiAnalyze("custom")}
                  disabled={!aiCustomPrompt.trim()}
                >
                  <Text style={[styles.aiCustomBtnText, { color: "#0D1117" }]}>分析</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Mode: Loading */}
          {aiLoading && (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={[styles.emptyText, { color: colors.muted }]}>分析中...</Text>
            </View>
          )}

          {/* Mode: Result */}
          {aiAnalysisMode === "result" && aiResult && !aiLoading && (
            <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.aiContent, { backgroundColor: colors.background }]}>
              <View style={[styles.aiSection, { backgroundColor: colors.surface }]}>
                <Text style={[styles.aiSectionTitle, { color: colors.muted }]}>分析结果</Text>
                <Text style={[styles.aiSectionText, { color: colors.foreground }]}>{aiResult.summary}</Text>
              </View>

              {aiResult.rootCause && (
                <View style={[styles.aiSection, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.aiSectionTitle, { color: colors.muted }]}>根本原因</Text>
                  <Text style={[styles.aiSectionText, { color: colors.foreground }]}>{aiResult.rootCause}</Text>
                </View>
              )}

              {aiResult.suggestions?.length > 0 && (
                <View style={[styles.aiSection, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.aiSectionTitle, { color: colors.muted }]}>建议</Text>
                  {aiResult.suggestions.map((s: string, i: number) => (
                    <Text key={i} style={[styles.aiSuggestion, { color: colors.foreground }]}>
                      • {s}
                    </Text>
                  ))}
                </View>
              )}

              {aiResult.fixCommands?.length > 0 && (
                <View style={[styles.aiSection, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.aiSectionTitle, { color: colors.muted }]}>修复命令</Text>
                  {aiResult.fixCommands.map((cmd: string, i: number) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.cmdRow, { backgroundColor: colors.background, borderColor: colors.border }]}
                      onPress={() => handleApplyFix(cmd)}
                      disabled={applyingFix}
                    >
                      <Text
                        style={[styles.cmdText, { color: colors.primary, fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace" }]}
                        numberOfLines={2}
                      >
                        {cmd}
                      </Text>
                      {applyingFix ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <IconSymbol name="arrow.right" size={18} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={[styles.aiBackBtn, { backgroundColor: colors.primary }]}
                onPress={() => setAiAnalysisMode("select")}
              >
                <Text style={styles.aiBackBtnText}>返回选择</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    gap: 12,
  },
  headerLeft: {
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  filterGroup: {
    flexDirection: "row",
    gap: 8,
    borderRadius: 8,
    padding: 4,
    borderWidth: 0.5,
  },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  filterText: {
    fontSize: 12,
    fontWeight: "500",
  },
  headerRight: {
    flexDirection: "row",
    gap: 12,
  },
  iconBtn: {
    padding: 8,
  },
  logContainer: {
    flex: 1,
  },
  logContent: {
    padding: 12,
    gap: 8,
  },
  logLine: {
    gap: 4,
    padding: 8,
    borderRadius: 6,
    marginBottom: 4,
  },
  logTime: {
    fontSize: 11,
  },
  logText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "500",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderTopWidth: 0.5,
  },
  streamBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  streamBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D1117",
  },
  aiBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
  },
  aiBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D1117",
  },
  streamingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  streamingText: {
    fontSize: 12,
    fontWeight: "500",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  aiSelectContent: {
    padding: 16,
    gap: 12,
  },
  aiSelectTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  aiOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  aiOptionText: {
    flex: 1,
    gap: 4,
  },
  aiOptionTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  aiOptionDesc: {
    fontSize: 12,
  },
  aiCustomContent: {
    flex: 1,
    padding: 16,
    justifyContent: "space-between",
  },
  aiCustomLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
  },
  aiCustomInput: {
    borderWidth: 0.5,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 100,
    textAlignVertical: "top",
  },
  aiCustomButtons: {
    flexDirection: "row",
    gap: 12,
  },
  aiCustomBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 0.5,
  },
  aiCustomBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  aiContent: {
    padding: 16,
    gap: 12,
  },
  aiSection: {
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  aiSectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  aiSectionText: {
    fontSize: 13,
    lineHeight: 20,
  },
  aiSuggestion: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 8,
  },
  cmdRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 8,
    borderWidth: 0.5,
    marginBottom: 8,
  },
  cmdText: {
    flex: 1,
    fontSize: 12,
  },
  aiBackBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  aiBackBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D1117",
  },
});
