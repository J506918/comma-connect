import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Platform,
} from "react-native";
import { useTranslation } from "react-i18next";
import * as DocumentPicker from "expo-document-picker";
// expo-file-system removed to avoid Expo Go crashes
import * as Sharing from "expo-sharing";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAppStore } from "@/lib/store";
import { sshService, type SFTPEntry } from "@/lib/ssh-service";

// ─── File Icon ────────────────────────────────────────────────────────────────

function getFileIcon(entry: SFTPEntry): string {
  if (entry.isDirectory) return "folder";
  const ext = entry.filename.split(".").pop()?.toLowerCase();
  if (["py", "js", "ts", "tsx", "jsx", "c", "cpp", "h", "rs", "go"].includes(ext || ""))
    return "code";
  if (["txt", "md", "log", "conf", "cfg", "ini", "yaml", "yml", "json", "xml"].includes(ext || ""))
    return "text";
  if (["png", "jpg", "jpeg", "gif", "bmp", "svg"].includes(ext || "")) return "image";
  return "file";
}

function formatSize(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + " GB";
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + " KB";
  return bytes + " B";
}

function formatDate(mtime: number): string {
  return new Date(mtime * 1000).toLocaleDateString();
}

// ─── Code Editor Modal ────────────────────────────────────────────────────────

function CodeEditorModal({
  visible,
  filePath,
  content,
  onSave,
  onClose,
  colors,
  t,
}: {
  visible: boolean;
  filePath: string;
  content: string;
  onSave: (content: string) => Promise<void>;
  onClose: () => void;
  colors: any;
  t: any;
}) {
  const [text, setText] = useState(content);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText(content);
  }, [content]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(text);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[{ flex: 1, backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[editorStyles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={editorStyles.btn}>
            <Text style={[editorStyles.btnText, { color: colors.muted }]}>{t("common.cancel")}</Text>
          </TouchableOpacity>
          <Text style={[editorStyles.title, { color: colors.foreground }]} numberOfLines={1}>
            {filePath.split("/").pop()}
          </Text>
          <TouchableOpacity
            onPress={handleSave}
            style={editorStyles.btn}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[editorStyles.btnText, { color: colors.primary }]}>{t("files.save")}</Text>
            )}
          </TouchableOpacity>
        </View>
        {/* Editor */}
        <TextInput
          style={[
            editorStyles.editor,
            {
              color: colors.foreground,
              backgroundColor: colors.background,
              fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
            },
          ]}
          value={text}
          onChangeText={setText}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          scrollEnabled
          textAlignVertical="top"
        />
      </View>
    </Modal>
  );
}

const editorStyles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    paddingTop: 56,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
    textAlign: "center",
    marginHorizontal: 8,
  },
  btn: {
    minWidth: 60,
    alignItems: "center",
  },
  btnText: {
    fontSize: 15,
    fontWeight: "600",
  },
  editor: {
    flex: 1,
    padding: 12,
    fontSize: 13,
    lineHeight: 20,
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function FilesScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const { connectionStatus } = useAppStore();
  const isConnected = connectionStatus === "connected";

  const [currentPath, setCurrentPath] = useState("/");
  const [entries, setEntries] = useState<SFTPEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Context menu
  const [selectedEntry, setSelectedEntry] = useState<SFTPEntry | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);

  // Rename modal
  const [renameVisible, setRenameVisible] = useState(false);
  const [newName, setNewName] = useState("");

  // Code editor
  const [editorVisible, setEditorVisible] = useState(false);
  const [editorPath, setEditorPath] = useState("");
  const [editorContent, setEditorContent] = useState("");
  const [editorLoading, setEditorLoading] = useState(false);

  const loadDir = useCallback(async (path: string) => {
    if (!sshService.isConnected) return;
    setLoading(true);
    setError(null);
    try {
      const list = await sshService.listDir(path);
      setEntries(list);
      setCurrentPath(path);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isConnected) {
      loadDir("/");
    } else {
      setEntries([]);
      setCurrentPath("/");
    }
  }, [isConnected]);

  const navigateTo = (entry: SFTPEntry) => {
    if (entry.isDirectory) {
      const newPath = currentPath === "/" ? `/${entry.filename}` : `${currentPath}/${entry.filename}`;
      loadDir(newPath);
    } else {
      setSelectedEntry(entry);
      setMenuVisible(true);
    }
  };

  const goBack = () => {
    if (currentPath === "/") return;
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    loadDir(parts.length === 0 ? "/" : "/" + parts.join("/"));
  };

  const handleLongPress = (entry: SFTPEntry) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedEntry(entry);
    setMenuVisible(true);
  };

  // ─── Actions ────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!selectedEntry) return;
    setMenuVisible(false);
    Alert.alert(
      t("files.confirmDelete"),
      t("files.confirmDeleteMsg", { name: selectedEntry.filename }),
      [
        { text: t("files.cancel"), style: "cancel" },
        {
          text: t("files.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              const fullPath = `${currentPath === "/" ? "" : currentPath}/${selectedEntry.filename}`;
              if (selectedEntry.isDirectory) {
                await sshService.deleteDir(fullPath);
              } else {
                await sshService.deleteFile(fullPath);
              }
              loadDir(currentPath);
            } catch (err: any) {
              Alert.alert(t("common.error"), err.message || '删除失败');
            }
          },
        },
      ]
    );
  };

  const handleRename = () => {
    if (!selectedEntry) return;
    setMenuVisible(false);
    setNewName(selectedEntry.filename);
    setRenameVisible(true);
  };

  const confirmRename = async () => {
    if (!selectedEntry || !newName.trim()) return;
    setRenameVisible(false);
    try {
      const oldPath = `${currentPath === "/" ? "" : currentPath}/${selectedEntry.filename}`;
      const newPath = `${currentPath === "/" ? "" : currentPath}/${newName.trim()}`;
      await sshService.rename(oldPath, newPath);
      loadDir(currentPath);
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || '重命名失败');
    }
  };

  const handleDownload = async () => {
    if (!selectedEntry || selectedEntry.isDirectory) return;
    setMenuVisible(false);
    const remotePath = `${currentPath === "/" ? "" : currentPath}/${selectedEntry.filename}`;
    const tmpPath = `/tmp/cc_download_${selectedEntry.filename}`;

    try {
      // Copy file to /tmp on device for easy access
      await sshService.exec(`cp "${remotePath}" "${tmpPath}" 2>&1`);
      Alert.alert(t("common.success"), `文件已复制到设备 ${tmpPath}`);
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || '下载失败');
    }
  };

  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const remotePath = `${currentPath === "/" ? "" : currentPath}/${asset.name}`;
      await sshService.uploadFile(asset.uri, remotePath);
      loadDir(currentPath);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || '上传失败');
    }
  };

  const handleViewCode = async () => {
    if (!selectedEntry) return;
    setMenuVisible(false);
    setEditorLoading(true);
    const remotePath = `${currentPath === "/" ? "" : currentPath}/${selectedEntry.filename}`;
    try {
      const content = await sshService.readFile(remotePath);
      setEditorPath(remotePath);
      setEditorContent(content);
      setEditorVisible(true);
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || '读取文件失败');
    } finally {
      setEditorLoading(false);
    }
  };

  const handleSaveCode = async (content: string) => {
    await sshService.writeFile(editorPath, content);
  };

  // ─── Breadcrumb ──────────────────────────────────────────────────────────────

  const breadcrumbs = currentPath === "/"
    ? ["/"]
    : ["", ...currentPath.split("/").filter(Boolean)];

  // ─── Render ──────────────────────────────────────────────────────────────────

  const renderEntry = ({ item }: { item: SFTPEntry }) => (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.border }]}
      onPress={() => navigateTo(item)}
      onLongPress={() => handleLongPress(item)}
    >
      <View style={[styles.rowIcon, { backgroundColor: item.isDirectory ? colors.primary + "22" : colors.surface2 }]}>
        <IconSymbol
          name={getFileIcon(item) as any}
          size={18}
          color={item.isDirectory ? colors.primary : colors.muted}
        />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={[styles.rowName, { color: colors.foreground }]} numberOfLines={1}>
          {item.filename}
        </Text>
        <Text style={[styles.rowMeta, { color: colors.muted }]}>
          {item.isDirectory ? "—" : formatSize(item.size)} · {formatDate(item.mtime)}
        </Text>
      </View>
      {item.isDirectory && (
        <IconSymbol name="chevron.right" size={16} color={colors.muted} />
      )}
    </TouchableOpacity>
  );

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>{t("files.title")}</Text>
        {isConnected && (
          <TouchableOpacity onPress={handleUpload} style={[styles.uploadBtn, { backgroundColor: colors.primary }]}>
            <IconSymbol name="upload" size={18} color="#0D1117" />
            <Text style={styles.uploadText}>{t("files.upload")}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Breadcrumb */}
      {isConnected && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.breadcrumb, { backgroundColor: colors.surface }]}
          contentContainerStyle={styles.breadcrumbContent}
        >
          {currentPath !== "/" && (
            <TouchableOpacity onPress={goBack} style={styles.backBtn}>
              <IconSymbol name="back" size={16} color={colors.primary} />
            </TouchableOpacity>
          )}
          <Text style={[styles.breadcrumbText, { color: colors.muted }]}>
            {currentPath}
          </Text>
        </ScrollView>
      )}

      {/* File List */}
      {!isConnected ? (
        <View style={styles.empty}>
          <IconSymbol name="folder" size={56} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.muted }]}>{t("device.notConnected")}</Text>
        </View>
      ) : loading ? (
        <View style={styles.empty}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : error ? (
        <View style={styles.empty}>
          <IconSymbol name="error" size={40} color={colors.error} />
          <Text style={[styles.emptyText, { color: colors.error }]}>{error}</Text>
          <TouchableOpacity onPress={() => loadDir(currentPath)} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.retryText}>{t("common.retry")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={entries}
          renderItem={renderEntry}
          keyExtractor={(item) => item.filename}
          contentContainerStyle={entries.length === 0 ? styles.emptyList : undefined}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: colors.muted }]}>{t("files.noFiles")}</Text>
            </View>
          }
        />
      )}

      {/* Context Menu Modal */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={[styles.menu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.menuTitle, { color: colors.foreground }]} numberOfLines={1}>
              {selectedEntry?.filename}
            </Text>
            {selectedEntry && !selectedEntry.isDirectory && (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={handleViewCode}>
                  {editorLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <IconSymbol name="edit" size={18} color={colors.primary} />
                  )}
                  <Text style={[styles.menuItemText, { color: colors.foreground }]}>{t("files.editCode")}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={handleDownload}>
                  <IconSymbol name="download" size={18} color={colors.primary} />
                  <Text style={[styles.menuItemText, { color: colors.foreground }]}>{t("files.download")}</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={styles.menuItem} onPress={handleRename}>
              <IconSymbol name="rename" size={18} color={colors.warning} />
              <Text style={[styles.menuItemText, { color: colors.foreground }]}>{t("files.rename")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
              <IconSymbol name="delete" size={18} color={colors.error} />
              <Text style={[styles.menuItemText, { color: colors.error }]}>{t("files.delete")}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Rename Modal */}
      <Modal visible={renameVisible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.dialog, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.dialogTitle, { color: colors.foreground }]}>{t("files.renameTitle")}</Text>
            <TextInput
              style={[styles.dialogInput, { color: colors.foreground, backgroundColor: colors.surface2, borderColor: colors.border }]}
              value={newName}
              onChangeText={setNewName}
              autoFocus
              selectTextOnFocus
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.dialogBtns}>
              <TouchableOpacity onPress={() => setRenameVisible(false)} style={[styles.dialogBtn, { borderColor: colors.border }]}>
                <Text style={[styles.dialogBtnText, { color: colors.muted }]}>{t("files.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmRename} style={[styles.dialogBtn, { backgroundColor: colors.primary }]}>
                <Text style={[styles.dialogBtnText, { color: "#0D1117" }]}>{t("files.confirm")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Code Editor */}
      <CodeEditorModal
        visible={editorVisible}
        filePath={editorPath}
        content={editorContent}
        onSave={handleSaveCode}
        onClose={() => setEditorVisible(false)}
        colors={colors}
        t={t}
      />
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
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    gap: 6,
  },
  uploadText: {
    color: "#0D1117",
    fontSize: 13,
    fontWeight: "600",
  },
  breadcrumb: {
    maxHeight: 40,
    borderBottomWidth: 0.5,
    borderBottomColor: "#30363D",
  },
  breadcrumbContent: {
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  backBtn: {
    marginRight: 8,
  },
  breadcrumbText: {
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  rowName: {
    fontSize: 14,
    fontWeight: "500",
  },
  rowMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32,
  },
  emptyList: {
    flex: 1,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: {
    color: "#0D1117",
    fontWeight: "600",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  menu: {
    width: 280,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    padding: 4,
  },
  menuTitle: {
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 16,
    paddingVertical: 10,
    opacity: 0.6,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: "500",
  },
  dialog: {
    width: 300,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  dialogTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  dialogInput: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 15,
    marginBottom: 16,
  },
  dialogBtns: {
    flexDirection: "row",
    gap: 10,
  },
  dialogBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dialogBtnText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
