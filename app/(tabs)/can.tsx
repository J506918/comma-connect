import { useState, useRef, useCallback, useEffect } from "react";
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
  TextInput,
  Platform,
} from "react-native";
import { useTranslation } from "react-i18next";

import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAppStore } from "@/lib/store";
import { sshService, type CanMessage } from "@/lib/ssh-service";
import { analyzeCanData } from "@/lib/ai-service";

export default function CanScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const { connectionStatus, aiApiKey } = useAppStore();
  const isConnected = connectionStatus === "connected";

  // In-memory buffer — cleared on unmount
  const [messages, setMessages] = useState<CanMessage[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const stopCaptureRef = useRef<(() => void) | null>(null);
  const listRef = useRef<FlatList>(null);

  // Clear buffer on unmount (as per spec)
  useEffect(() => {
    return () => {
      setMessages([]);
      if (stopCaptureRef.current) stopCaptureRef.current();
    };
  }, []);

  useEffect(() => {
    if (!isConnected && capturing) {
      stopCapture();
    }
  }, [isConnected]);

  const startCapture = async () => {
    if (!sshService.isConnected) return;
    try {
      const stop = await sshService.startCanCapture(
        (msg) => {
          setMessages((prev) => {
            const updated = [...prev, msg];
            return updated.length > 5000 ? updated.slice(-5000) : updated;
          });
        },
        (err) => {
          console.warn("CAN capture error:", err);
          setCapturing(false);
        }
      );
      stopCaptureRef.current = stop;
      setCapturing(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || '导出失败');
    }
  };

  const stopCapture = () => {
    if (stopCaptureRef.current) {
      stopCaptureRef.current();
      stopCaptureRef.current = null;
    }
    setCapturing(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const clearMessages = () => {
    setMessages([]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const exportMessages = async () => {
    if (messages.length === 0) return;
    const header = "Timestamp,Channel,ID,DLC,Data\n";
    const rows = messages
      .map((m) => `${m.timestamp},${m.channel},${m.id},${m.dlc ?? 0},"${m.data}"`)
      .join("\n");
    const content = header + rows;
    // Save to device via SSH since expo-file-system may crash in Expo Go
    if (sshService.isConnected) {
      try {
        const remotePath = `/tmp/can_data_${Date.now()}.csv`;
        await sshService.writeFile(remotePath, content);
        Alert.alert(t("common.success"), `${t("can.exported")}\n${remotePath}`);
      } catch (err: any) {
        Alert.alert(t("common.error"), err.message || t("common.failed"));
      }
    } else {
      Alert.alert(t("common.error"), t("device.notConnected"));
    }
  };

  const handleAiAnalyze = async () => {
    if (messages.length === 0) return;
    setAiLoading(true);
    setAiResult(null);
    setAiModalVisible(true);

    const sample = messages.slice(-200).map((m) => ({
      id: m.id,
      data: m.data,
      dlc: m.dlc ?? 0,
    }));

    try {
      const result = await analyzeCanData(sample, aiApiKey || undefined);
      setAiResult(result);
    } catch (err: any) {
      setAiResult({ signals: [], summary: err.message });
    } finally {
      setAiLoading(false);
    }
  };

  const filteredMessages = filterText
    ? messages.filter((m) => m.id.includes(filterText.toUpperCase()))
    : messages;

  const renderMessage = ({ item }: { item: CanMessage }) => (
    <View style={[styles.msgRow, { borderBottomColor: "#1E2530" }]}>
      <Text style={[styles.msgId, { color: "#60A5FA" }]}>{item.id}</Text>
      <Text style={[styles.msgDlc, { color: "#9CA3AF" }]}>[{item.dlc ?? 0}]</Text>
      <Text
        style={[styles.msgData, { color: "#FFFFFF", fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace" }]}
        numberOfLines={1}
      >
        {item.data}
      </Text>
      <Text style={[styles.msgTs, { color: "#9CA3AF" }]}>
        {item.timestamp.toFixed(3)}
      </Text>
    </View>
  );

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>{t("can.title")}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={clearMessages}
            style={styles.iconBtn}
            disabled={messages.length === 0}
          >
            <IconSymbol name="close" size={20} color={messages.length > 0 ? colors.muted : colors.border} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={exportMessages}
            style={styles.iconBtn}
            disabled={messages.length === 0}
          >
            <IconSymbol name="export" size={20} color={messages.length > 0 ? colors.primary : colors.border} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleAiAnalyze}
            style={[styles.aiBtn, { backgroundColor: colors.primary + "22", borderColor: colors.primary }]}
            disabled={messages.length === 0}
          >
            <IconSymbol name="ai" size={16} color={colors.primary} />
            <Text style={[styles.aiBtnText, { color: colors.primary }]}>{t("can.aiAnalyze")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats Bar */}
      <View style={[styles.statsBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.foreground }]}>{messages.length}</Text>
          <Text style={[styles.statLabel, { color: colors.muted }]}>{t("can.messages")}</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={[styles.captureStatus, { flex: 1 }]}>
          <View style={[styles.statusDot, { backgroundColor: capturing ? colors.success : colors.muted }]} />
          <Text style={[styles.captureStatusText, { color: capturing ? colors.success : colors.muted }]}>
            {capturing ? t("can.capturing") : t("can.stopped")}
          </Text>
        </View>
        {/* Filter */}
        <View style={[styles.filterInput, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
          <IconSymbol name="filter" size={14} color={colors.muted} />
          <TextInput
            style={[styles.filterText, { color: colors.foreground }]}
            value={filterText}
            onChangeText={setFilterText}
            placeholder={t("can.filterById")}
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </View>
      </View>

      {/* Column Headers */}
      <View style={[styles.colHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.colId, { color: colors.muted }]}>{t("can.id")}</Text>
        <Text style={[styles.colDlc, { color: colors.muted }]}>{t("can.dlc")}</Text>
        <Text style={[styles.colData, { color: colors.muted }]}>{t("can.data")}</Text>
        <Text style={[styles.colTs, { color: colors.muted }]}>{t("can.timestamp")}</Text>
      </View>

      {/* Message List */}
      <View style={[styles.msgList, { backgroundColor: "#0A0E13" }]}>
        {!isConnected ? (
          <View style={styles.empty}>
            <IconSymbol name="can" size={48} color="#4B5563" />
            <Text style={[styles.emptyText, { color: "#9CA3AF" }]}>{t("device.notConnected")}</Text>
          </View>
        ) : filteredMessages.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: "#9CA3AF" }]}>{t("can.noMessages")}</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={filteredMessages}
            renderItem={renderMessage}
            keyExtractor={(item, idx) => `${item.id}-${idx}`}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() =>
              capturing && listRef.current?.scrollToEnd({ animated: false })
            }
            removeClippedSubviews
            maxToRenderPerBatch={100}
            windowSize={10}
            initialNumToRender={50}
          />
        )}
      </View>

      {/* Start/Stop Button */}
      {isConnected && (
        <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[
              styles.captureBtn,
              { backgroundColor: capturing ? colors.error : colors.success },
            ]}
            onPress={capturing ? stopCapture : startCapture}
          >
            <IconSymbol name={capturing ? "stop" : "play"} size={22} color="#0D1117" />
            <Text style={styles.captureBtnText}>
              {capturing ? t("can.stop") : t("can.start")}
            </Text>
          </TouchableOpacity>
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
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("can.aiTitle")}</Text>
            <TouchableOpacity onPress={() => setAiModalVisible(false)}>
              <IconSymbol name="close" size={24} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {aiLoading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={[styles.emptyText, { color: colors.muted }]}>{t("logs.analyzing")}</Text>
            </View>
          ) : aiResult ? (
            <ScrollView contentContainerStyle={styles.aiContent}>
              <View style={[styles.aiSection, { backgroundColor: colors.surface }]}>
                <Text style={[styles.aiSectionTitle, { color: colors.muted }]}>概要</Text>
                <Text style={[styles.aiSectionText, { color: colors.foreground }]}>{aiResult.summary}</Text>
              </View>
              {aiResult.signals?.length > 0 && (
                <View style={[styles.aiSection, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.aiSectionTitle, { color: colors.muted }]}>识别到的信号</Text>
                  {aiResult.signals.map((s: any, i: number) => (
                    <View key={i} style={[styles.signalRow, { borderBottomColor: colors.border }]}>
                      <Text style={[styles.signalId, { color: colors.primary }]}>{s.id}</Text>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.signalDesc, { color: colors.foreground }]}>{s.description}</Text>
                        {s.unit && (
                          <Text style={[styles.signalUnit, { color: colors.muted }]}>
                            {s.unit}{s.values ? ` · ${s.values}` : ""}
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          ) : null}
        </View>
      </Modal>
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
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  aiBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    gap: 5,
  },
  aiBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  statsBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    gap: 12,
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "500",
  },
  statDivider: {
    width: 1,
    height: 24,
  },
  captureStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  captureStatusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  filterInput: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    maxWidth: 120,
  },
  filterText: {
    fontSize: 12,
    flex: 1,
  },
  colHeader: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 0.5,
  },
  colId: { width: 60, fontSize: 10, fontWeight: "700" },
  colDlc: { width: 30, fontSize: 10, fontWeight: "700" },
  colData: { flex: 1, fontSize: 10, fontWeight: "700" },
  colTs: { width: 80, fontSize: 10, fontWeight: "700", textAlign: "right" },
  msgList: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 20,
  },
  msgRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 0.5,
  },
  msgId: {
    width: 60,
    fontSize: 11,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
  },
  msgDlc: {
    width: 30,
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
  },
  msgData: {
    flex: 1,
    fontSize: 11,
  },
  msgTs: {
    width: 80,
    fontSize: 10,
    textAlign: "right",
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: "500",
    textAlign: "center",
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 0.5,
  },
  captureBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    borderRadius: 14,
    gap: 10,
  },
  captureBtnText: {
    color: "#0D1117",
    fontSize: 16,
    fontWeight: "700",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    paddingTop: 56,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  aiContent: {
    padding: 16,
    gap: 12,
  },
  aiSection: {
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
  },
  aiSectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  aiSectionText: {
    fontSize: 14,
    lineHeight: 22,
  },
  signalRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  signalId: {
    fontSize: 13,
    fontWeight: "700",
    width: 60,
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
  },
  signalDesc: {
    fontSize: 13,
    fontWeight: "500",
  },
  signalUnit: {
    fontSize: 11,
    marginTop: 2,
  },
});
