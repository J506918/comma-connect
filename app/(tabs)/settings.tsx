import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  Switch,
  Modal,
} from "react-native";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAppStore, type Repository } from "@/lib/store";
import { useThemeContext } from "@/lib/theme-provider";
import Constants from "expo-constants";

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ title, colors }: { title: string; colors: any }) {
  return (
    <Text style={[styles.sectionHeader, { color: colors.muted }]}>{title.toUpperCase()}</Text>
  );
}

// ─── Settings Row ─────────────────────────────────────────────────────────────

function SettingsRow({
  icon,
  label,
  value,
  onPress,
  colors,
  danger,
  right,
}: {
  icon: string;
  label: string;
  value?: string;
  onPress?: () => void;
  colors: any;
  danger?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
      disabled={!onPress && !right}
    >
      <View style={[styles.rowIcon, { backgroundColor: danger ? colors.error + "22" : colors.primary + "22" }]}>
        <IconSymbol name={icon as any} size={18} color={danger ? colors.error : colors.primary} />
      </View>
      <Text style={[styles.rowLabel, { color: danger ? colors.error : colors.foreground }]}>{label}</Text>
      {right ? (
        <View style={styles.rowRight}>{right}</View>
      ) : value ? (
        <Text style={[styles.rowValue, { color: colors.muted }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {onPress && !right && (
        <IconSymbol name="chevron.right" size={16} color={colors.muted} />
      )}
    </TouchableOpacity>
  );
}

// ─── Repo Modal ───────────────────────────────────────────────────────────────

function RepoModal({
  visible,
  editing,
  onSave,
  onClose,
  colors,
  t,
}: {
  visible: boolean;
  editing: Repository | null;
  onSave: (repo: Omit<Repository, "id">) => void;
  onClose: () => void;
  colors: any;
  t: any;
}) {
  const [type, setType] = useState<"github" | "gitee" | "custom">(editing?.type || "github");
  const [name, setName] = useState(editing?.name || "");
  const [owner, setOwner] = useState(editing?.owner || "");
  const [repo, setRepo] = useState(editing?.repo || "");
  const [url, setUrl] = useState(editing?.url || "");

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert(t("common.error"), t("settings.repoNameRequired"));
      return;
    }
    if (type !== "custom" && (!owner.trim() || !repo.trim())) {
      Alert.alert(t("common.error"), t("settings.repoOwnerRepoRequired"));
      return;
    }
    if (type === "custom" && !url.trim()) {
      Alert.alert(t("common.error"), t("settings.repoUrlRequired"));
      return;
    }
    onSave({ type, name: name.trim(), owner: owner.trim(), repo: repo.trim(), url: url.trim() });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[{ flex: 1, backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose}>
            <Text style={[styles.modalBtn, { color: colors.muted }]}>{t("common.cancel")}</Text>
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>
            {editing ? t("settings.editRepo") : t("settings.addRepo")}
          </Text>
          <TouchableOpacity onPress={handleSave}>
            <Text style={[styles.modalBtn, { color: colors.primary }]}>{t("common.save")}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.modalContent}>
          {/* Type Selector */}
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>{t("settings.repoType")}</Text>
          <View style={styles.typeRow}>
            {(["github", "gitee", "custom"] as const).map((tp) => (
              <TouchableOpacity
                key={tp}
                style={[
                  styles.typeChip,
                  {
                    backgroundColor: type === tp ? colors.primary : colors.surface,
                    borderColor: type === tp ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setType(tp)}
              >
                <Text style={[styles.typeChipText, { color: type === tp ? "#0D1117" : colors.muted }]}>
                  {tp.charAt(0).toUpperCase() + tp.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Name */}
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>{t("settings.repoDisplayName")}</Text>
          <TextInput
            style={[styles.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
            value={name}
            onChangeText={setName}
            placeholder={t("settings.repoDisplayNamePlaceholder")}
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {type !== "custom" ? (
            <>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>{t("settings.repoOwner")}</Text>
              <TextInput
                style={[styles.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={owner}
                onChangeText={setOwner}
                placeholder="e.g. commaai"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>{t("settings.repoName")}</Text>
              <TextInput
                style={[styles.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={repo}
                onChangeText={setRepo}
                placeholder="e.g. openpilot"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={[styles.fieldHint, { color: colors.muted }]}>
                {type === "github"
                  ? `https://github.com/${owner || "<owner>"}/${repo || "<repo>"}`
                  : `https://gitee.com/${owner || "<owner>"}/${repo || "<repo>"}`}
              </Text>
            </>
          ) : (
            <>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>{t("settings.repoUrl")}</Text>
              <TextInput
                style={[styles.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={url}
                onChangeText={setUrl}
                placeholder="https://your-git-server.com/owner/repo"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const { colorScheme, setColorScheme } = useThemeContext();
  const {
    sshConfig,
    setSshConfig,
    repositories,
    addRepository,
    updateRepository,
    removeRepository,
    aiApiKey,
    setAiApiKey,
  } = useAppStore();

  const [sshModalVisible, setSshModalVisible] = useState(false);
  const [repoModalVisible, setRepoModalVisible] = useState(false);
  const [editingRepo, setEditingRepo] = useState<Repository | null>(null);
  const [aiKeyModalVisible, setAiKeyModalVisible] = useState(false);

  // SSH form state
  const [sshHost, setSshHost] = useState(sshConfig.host);
  const [sshPort, setSshPort] = useState(String(sshConfig.port));
  const [sshUser, setSshUser] = useState(sshConfig.username);
  const [sshPass, setSshPass] = useState(sshConfig.password || "");
  const [sshKey, setSshKey] = useState(sshConfig.privateKey || "");
  const [sshAuthMethod, setSshAuthMethod] = useState<'password' | 'privateKey'>(sshConfig.authMethod || 'password');
  const [aiKeyInput, setAiKeyInput] = useState(aiApiKey || "");

  const saveSshConfig = () => {
    setSshConfig({
      host: sshHost.trim(),
      port: parseInt(sshPort) || 22,
      username: sshUser.trim() || 'comma',
      authMethod: sshAuthMethod,
      password: sshAuthMethod === 'password' ? sshPass : undefined,
      privateKey: sshAuthMethod === 'privateKey' ? sshKey.trim() : undefined,
    });
    setSshModalVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const toggleLanguage = () => {
    const next = i18n.language === "zh" ? "en" : "zh";
    i18n.changeLanguage(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleAddRepo = () => {
    setEditingRepo(null);
    setRepoModalVisible(true);
  };

  const handleEditRepo = (repo: Repository) => {
    setEditingRepo(repo);
    setRepoModalVisible(true);
  };

  const handleSaveRepo = (data: Omit<Repository, "id">) => {
    if (editingRepo) {
      updateRepository({ ...editingRepo, ...data });
    } else {
      addRepository(data);
    }
    setRepoModalVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDeleteRepo = (repo: Repository) => {
    Alert.alert(
      t("settings.deleteRepo"),
      t("settings.deleteRepoConfirm", { name: repo.name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("files.delete"),
          style: "destructive",
          onPress: () => removeRepository(repo.id),
        },
      ]
    );
  };

  const saveAiKey = () => {
    setAiApiKey(aiKeyInput.trim() || null);
    setAiKeyModalVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const appVersion = Constants.expoConfig?.version || "1.0.0";

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <Text style={[styles.pageTitle, { color: colors.foreground }]}>{t("settings.title")}</Text>

        {/* ── Connection ── */}
        <SectionHeader title={t("settings.connection")} colors={colors} />
        <SettingsRow
          icon="terminal"
          label={t("settings.sshConfig")}
          value={sshConfig.host ? `${sshConfig.username}@${sshConfig.host}:${sshConfig.port}` : t("settings.notConfigured")}
          onPress={() => {
            setSshHost(sshConfig.host);
            setSshPort(String(sshConfig.port));
            setSshUser(sshConfig.username);
            setSshPass(sshConfig.password || "");
            setSshKey(sshConfig.privateKey || "");
            setSshAuthMethod(sshConfig.authMethod || 'password');
            setSshModalVisible(true);
          }}
          colors={colors}
        />

        {/* ── Repositories ── */}
        <SectionHeader title={t("settings.repositories")} colors={colors} />
        {repositories.map((repo) => (
          <View key={repo.id} style={[styles.repoRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.repoIcon, { backgroundColor: colors.primary + "22" }]}>
              <IconSymbol name={repo.type === "github" ? "github" : "repo"} size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.repoName, { color: colors.foreground }]}>{repo.name}</Text>
              <Text style={[styles.repoUrl, { color: colors.muted }]} numberOfLines={1}>
                {repo.type === "github"
                  ? `github.com/${repo.owner}/${repo.repo}`
                  : repo.type === "gitee"
                  ? `gitee.com/${repo.owner}/${repo.repo}`
                  : repo.url}
              </Text>
            </View>
            <TouchableOpacity onPress={() => handleEditRepo(repo)} style={styles.repoAction}>
              <IconSymbol name="edit" size={18} color={colors.muted} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDeleteRepo(repo)} style={styles.repoAction}>
              <IconSymbol name="delete" size={18} color={colors.error} />
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity
          style={[styles.addRepoBtn, { backgroundColor: colors.surface, borderColor: colors.primary, borderStyle: "dashed" }]}
          onPress={handleAddRepo}
        >
          <IconSymbol name="add" size={20} color={colors.primary} />
          <Text style={[styles.addRepoBtnText, { color: colors.primary }]}>{t("settings.addRepo")}</Text>
        </TouchableOpacity>

        {/* ── AI ── */}
        <SectionHeader title={t("settings.ai")} colors={colors} />
        <SettingsRow
          icon="ai"
          label={t("settings.aiApiKey")}
          value={aiApiKey ? "••••••••" + aiApiKey.slice(-4) : t("settings.useBuiltIn")}
          onPress={() => {
            setAiKeyInput(aiApiKey || "");
            setAiKeyModalVisible(true);
          }}
          colors={colors}
        />

        {/* ── Appearance ── */}
        <SectionHeader title={t("settings.appearance")} colors={colors} />
        <SettingsRow
          icon="language"
          label={t("settings.language")}
          onPress={toggleLanguage}
          colors={colors}
          right={
            <View style={styles.langToggle}>
              <Text style={[styles.langOption, { color: i18n.language === "zh" ? colors.primary : colors.muted, fontWeight: i18n.language === "zh" ? "700" : "400" }]}>中文</Text>
              <Text style={[styles.langSep, { color: colors.border }]}>/</Text>
              <Text style={[styles.langOption, { color: i18n.language === "en" ? colors.primary : colors.muted, fontWeight: i18n.language === "en" ? "700" : "400" }]}>EN</Text>
            </View>
          }
        />
        <SettingsRow
          icon="theme"
          label={t("settings.theme")}
          colors={colors}
          right={
            <Switch
              value={colorScheme === "dark"}
              onValueChange={(v) => setColorScheme(v ? "dark" : "light")}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colorScheme === "dark" ? "#0D1117" : "#fff"}
            />
          }
        />

        {/* ── About ── */}
        <SectionHeader title={t("settings.about")} colors={colors} />
        <SettingsRow
          icon="info"
          label={t("settings.version")}
          value={appVersion}
          colors={colors}
        />
      </ScrollView>

      {/* ── SSH Config Modal ── */}
      <Modal visible={sshModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={[{ flex: 1, backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setSshModalVisible(false)}>
              <Text style={[styles.modalBtn, { color: colors.muted }]}>{t("common.cancel")}</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("settings.sshConfig")}</Text>
            <TouchableOpacity onPress={saveSshConfig}>
              <Text style={[styles.modalBtn, { color: colors.primary }]}>{t("common.save")}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            {/* Auth Method Selector */}
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>{t("settings.authMethod")}</Text>
            <View style={styles.typeRow}>
              {(["password", "privateKey"] as const).map((method) => (
                <TouchableOpacity
                  key={method}
                  style={[
                    styles.typeChip,
                    {
                      backgroundColor: sshAuthMethod === method ? colors.primary : colors.surface,
                      borderColor: sshAuthMethod === method ? colors.primary : colors.border,
                      flex: 1,
                      alignItems: "center",
                    },
                  ]}
                  onPress={() => setSshAuthMethod(method)}
                >
                  <Text style={[styles.typeChipText, { color: sshAuthMethod === method ? "#fff" : colors.muted }]}>
                    {method === "password" ? t("settings.authPassword") : t("settings.authPrivateKey")}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.muted }]}>{t("settings.host")}</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
              value={sshHost}
              onChangeText={setSshHost}
              placeholder="192.168.1.1"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="default"
            />
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>{t("settings.port")}</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
              value={sshPort}
              onChangeText={setSshPort}
              placeholder="22"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
            />
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>{t("settings.username")}</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
              value={sshUser}
              onChangeText={setSshUser}
              placeholder="comma"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {sshAuthMethod === 'password' ? (
              <>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>{t("settings.password")}</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
                  value={sshPass}
                  onChangeText={setSshPass}
                  placeholder={t("settings.passwordPlaceholder")}
                  placeholderTextColor={colors.muted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={[styles.fieldHint, { color: colors.muted, marginTop: 8 }]}>
                  {t("settings.passwordHint")}
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>{t("settings.privateKey")}</Text>
                <TextInput
                  style={[styles.input, styles.multilineInput, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
                  value={sshKey}
                  onChangeText={setSshKey}
                  placeholder={t("settings.privateKeyPlaceholder")}
                  placeholderTextColor={colors.muted}
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={[styles.fieldHint, { color: colors.muted, marginTop: 8 }]}>
                  {t("settings.privateKeyHint")}
                </Text>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Repo Modal ── */}
      <RepoModal
        visible={repoModalVisible}
        editing={editingRepo}
        onSave={handleSaveRepo}
        onClose={() => setRepoModalVisible(false)}
        colors={colors}
        t={t}
      />

      {/* ── AI Key Modal ── */}
      <Modal visible={aiKeyModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={[{ flex: 1, backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setAiKeyModalVisible(false)}>
              <Text style={[styles.modalBtn, { color: colors.muted }]}>{t("common.cancel")}</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("settings.aiApiKey")}</Text>
            <TouchableOpacity onPress={saveAiKey}>
              <Text style={[styles.modalBtn, { color: colors.primary }]}>{t("common.save")}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={[styles.fieldHint, { color: colors.muted, marginBottom: 16 }]}>
              {t("settings.aiKeyHint")}
            </Text>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>{t("settings.apiKey")}</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
              value={aiKeyInput}
              onChangeText={setAiKeyInput}
              placeholder={t("settings.apiKeyPlaceholder")}
              placeholderTextColor={colors.muted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </ScrollView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginTop: 24,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  rowValue: {
    fontSize: 13,
    maxWidth: 140,
    textAlign: "right",
  },
  rowRight: {
    alignItems: "flex-end",
  },
  repoRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  repoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  repoName: {
    fontSize: 14,
    fontWeight: "600",
  },
  repoUrl: {
    fontSize: 11,
    marginTop: 2,
  },
  repoAction: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  addRepoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 8,
    marginBottom: 8,
  },
  addRepoBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  langToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  langOption: {
    fontSize: 14,
  },
  langSep: {
    fontSize: 14,
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
    fontSize: 16,
    fontWeight: "700",
  },
  modalBtn: {
    fontSize: 15,
    fontWeight: "600",
  },
  modalContent: {
    padding: 20,
    paddingBottom: 40,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 12,
  },
  fieldHint: {
    fontSize: 12,
    lineHeight: 18,
  },
  input: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  multilineInput: {
    height: 120,
    textAlignVertical: "top",
    paddingTop: 10,
  },
  typeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  typeChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  typeChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
