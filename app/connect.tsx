import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAppStore } from "@/lib/store";
import { sshService } from "@/lib/ssh-service";

export default function ConnectScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const { sshConfig, setConnectionStatus, addRecentConnection } = useAppStore();
  const [loading, setLoading] = useState(false);

  const isConfigured = !!(sshConfig.host && sshConfig.username);

  const handleConnect = async () => {
    if (!isConfigured) {
      Alert.alert(
        t("connect.notConfigured"),
        t("connect.goConfigureHint"),
        [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("settings.title"), onPress: () => { router.back(); } },
        ]
      );
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    setConnectionStatus("connecting");

    try {
      await sshService.connect({
        host: sshConfig.host,
        port: sshConfig.port,
        username: sshConfig.username,
        password: sshConfig.authMethod === "password" ? sshConfig.password : undefined,
        privateKey: sshConfig.authMethod === "privateKey" ? sshConfig.privateKey : undefined,
      });

      setConnectionStatus("connected");
      addRecentConnection({
        id: `${sshConfig.host}:${sshConfig.port}`,
        host: sshConfig.host,
        port: sshConfig.port,
        username: sshConfig.username,
        lastUsed: Date.now(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err: any) {
      setConnectionStatus("error", err.message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const errMsg = err.message || '';
      // Translate common SSH error messages to Chinese
      let friendlyMsg = t("connect.failed");
      if (errMsg.includes('Auth fail') || errMsg.includes('auth')) {
        friendlyMsg = '认证失败，请检查密码或私钥是否正确';
      } else if (errMsg.includes('timeout') || errMsg.includes('Timeout')) {
        friendlyMsg = '连接超时，请检查设备 IP 和网络';
      } else if (errMsg.includes('refused') || errMsg.includes('Refused')) {
        friendlyMsg = '连接被拒绝，请确认设备 SSH 服务已开启';
      } else if (errMsg.includes('resolve') || errMsg.includes('host')) {
        friendlyMsg = '无法解析主机地址，请检查 IP 是否正确';
      } else if (errMsg) {
        friendlyMsg = `${t("connect.failed")}：${errMsg}`;
      }
      Alert.alert(t("common.error"), friendlyMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <View style={styles.container}>
        {/* Close button */}
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <IconSymbol name="close" size={22} color={colors.muted} />
        </TouchableOpacity>

        {/* Logo area */}
        <View style={styles.logoArea}>
          <View style={[styles.logoCircle, { backgroundColor: colors.primary + "18" }]}>
            <IconSymbol name="device" size={48} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {t("connect.title")}
          </Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            {t("connect.subtitle")}
          </Text>
        </View>

        {/* Config preview card */}
        {isConfigured ? (
          <View style={[styles.configCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.configRow}>
              <IconSymbol name="server" size={16} color={colors.primary} />
              <Text style={[styles.configLabel, { color: colors.muted }]}>{t("connect.host")}</Text>
              <Text style={[styles.configValue, { color: colors.foreground }]}>
                {sshConfig.host}:{sshConfig.port}
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.configRow}>
              <IconSymbol name="user" size={16} color={colors.primary} />
              <Text style={[styles.configLabel, { color: colors.muted }]}>{t("connect.username")}</Text>
              <Text style={[styles.configValue, { color: colors.foreground }]}>
                {sshConfig.username}
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.configRow}>
              <IconSymbol name="key" size={16} color={colors.primary} />
              <Text style={[styles.configLabel, { color: colors.muted }]}>{t("connect.authMethod")}</Text>
              <Text style={[styles.configValue, { color: colors.foreground }]}>
                {sshConfig.authMethod === "privateKey" ? t("connect.authKey") : t("connect.authPassword")}
              </Text>
            </View>
          </View>
        ) : (
          <View style={[styles.configCard, styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.warning }]}>
            <IconSymbol name="warning" size={20} color={colors.warning} />
            <Text style={[styles.emptyCardText, { color: colors.warning }]}>
              {t("connect.notConfigured")}
            </Text>
            <Text style={[styles.emptyCardHint, { color: colors.muted }]}>
              {t("connect.goConfigureHint")}
            </Text>
          </View>
        )}

        {/* Connect button */}
        <TouchableOpacity
          style={[
            styles.connectBtn,
            { backgroundColor: isConfigured ? colors.primary : colors.surface2 },
            loading && { opacity: 0.7 },
          ]}
          onPress={handleConnect}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={isConfigured ? "#fff" : colors.muted} size="small" />
          ) : (
            <IconSymbol name="connect" size={20} color={isConfigured ? "#fff" : colors.muted} />
          )}
          <Text style={[styles.connectBtnText, { color: isConfigured ? "#fff" : colors.muted }]}>
            {loading ? t("connect.connecting") : t("connect.connect")}
          </Text>
        </TouchableOpacity>

        {/* Go to settings hint */}
        <TouchableOpacity
          style={styles.settingsHint}
          onPress={() => router.back()}
        >
          <Text style={[styles.settingsHintText, { color: colors.muted }]}>
            {t("connect.editInSettings")}
          </Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
  },
  closeBtn: {
    alignSelf: "flex-end",
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  logoArea: {
    alignItems: "center",
    marginTop: 24,
    marginBottom: 32,
    gap: 12,
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  configCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
    gap: 4,
  },
  configRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 10,
  },
  configLabel: {
    fontSize: 13,
    width: 72,
  },
  configValue: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
    textAlign: "right",
  },
  divider: {
    height: 0.5,
    marginVertical: 2,
  },
  emptyCard: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 8,
  },
  emptyCardText: {
    fontSize: 15,
    fontWeight: "600",
  },
  emptyCardHint: {
    fontSize: 13,
    textAlign: "center",
  },
  connectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 54,
    borderRadius: 16,
    gap: 10,
    marginBottom: 16,
  },
  connectBtnText: {
    fontSize: 17,
    fontWeight: "700",
  },
  settingsHint: {
    alignItems: "center",
    paddingVertical: 8,
  },
  settingsHintText: {
    fontSize: 13,
  },
});
