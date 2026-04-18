import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Animated,
  Easing,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAppStore } from "@/lib/store";
import { sshService } from "@/lib/ssh-service";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + " GB";
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(0) + " MB";
  return (bytes / 1024).toFixed(0) + " KB";
}

function parseMemInfo(raw: string): { total: number; used: number } {
  const lines = raw.split("\n");
  let total = 0, available = 0;
  for (const line of lines) {
    if (line.startsWith("MemTotal:")) total = parseInt(line.split(/\s+/)[1]) * 1024;
    if (line.startsWith("MemAvailable:")) available = parseInt(line.split(/\s+/)[1]) * 1024;
  }
  return { total, used: total - available };
}

function parseDiskInfo(raw: string): { total: number; used: number } {
  const parts = raw.trim().split(/\s+/);
  if (parts.length >= 4) {
    return { total: parseInt(parts[1]) * 1024, used: parseInt(parts[2]) * 1024 };
  }
  return { total: 0, used: 0 };
}

function parseCpuUsage(raw: string): number {
  const match = raw.match(/(\d+(?:\.\d+)?)\s*%?\s*(?:us|user|idle)/i);
  if (match) {
    const val = parseFloat(match[1]);
    if (raw.toLowerCase().includes("idle")) return Math.max(0, 100 - val);
    return val;
  }
  const m2 = raw.match(/(\d+(?:\.\d+)?)%/);
  return m2 ? parseFloat(m2[1]) : 0;
}

function tempColor(temp: number, colors: any): string {
  if (temp >= 80) return colors.error;
  if (temp >= 65) return colors.warning;
  return colors.success;
}

function usageColor(pct: number, colors: any): string {
  if (pct >= 90) return colors.error;
  if (pct >= 70) return colors.warning;
  return colors.primary;
}

// ─── Spinning Fan Icon ────────────────────────────────────────────────────────

function FanIcon({ rpm, size, color }: { rpm?: number; size: number; color: string }) {
  const spinAnim = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (rpm && rpm > 0) {
      const duration = Math.max(300, Math.min(1500, 60000 / rpm));
      animRef.current = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      animRef.current.start();
    } else {
      animRef.current?.stop();
      spinAnim.setValue(0);
    }
    return () => animRef.current?.stop();
  }, [rpm]);

  const rotate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <IconSymbol name="fan" size={size} color={color} />
    </Animated.View>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  iconColor,
  colors,
  customIcon,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  iconColor: string;
  colors: any;
  customIcon?: React.ReactNode;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.statIconBg, { backgroundColor: iconColor + "18" }]}>
        {customIcon ?? <IconSymbol name={icon as any} size={22} color={iconColor} />}
      </View>
      <Text style={[styles.statLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      {sub && <Text style={[styles.statSub, { color: colors.muted }]}>{sub}</Text>}
    </View>
  );
}

// ─── Usage Bar Card ───────────────────────────────────────────────────────────

function UsageBar({
  icon,
  label,
  used,
  total,
  color,
  colors,
}: {
  icon: string;
  label: string;
  used: number;
  total: number;
  color: string;
  colors: any;
}) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  return (
    <View style={[styles.usageCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.usageHeader}>
        <View style={styles.usageLabelRow}>
          <View style={[styles.usageIconBg, { backgroundColor: color + "18" }]}>
            <IconSymbol name={icon as any} size={16} color={color} />
          </View>
          <Text style={[styles.usageLabel, { color: colors.foreground }]}>{label}</Text>
        </View>
        <Text style={[styles.usagePct, { color: color }]}>{pct.toFixed(0)}%</Text>
      </View>
      <View style={[styles.barBg, { backgroundColor: colors.border }]}>
        <View style={[styles.barFill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[styles.usageSub, { color: colors.muted }]}>
        {formatBytes(used)} / {formatBytes(total)}
      </Text>
    </View>
  );
}

// ─── CPU/GPU Bar ──────────────────────────────────────────────────────────────

function CpuGpuBar({
  icon,
  label,
  value,
  color,
  colors,
}: {
  icon: string;
  label: string;
  value: number;
  color: string;
  colors: any;
}) {
  return (
    <View style={[styles.cpuCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.usageHeader}>
        <View style={styles.usageLabelRow}>
          <View style={[styles.usageIconBg, { backgroundColor: color + "18" }]}>
            <IconSymbol name={icon as any} size={16} color={color} />
          </View>
          <Text style={[styles.usageLabel, { color: colors.foreground }]}>{label}</Text>
        </View>
        <Text style={[styles.usagePct, { color: color }]}>{value.toFixed(0)}%</Text>
      </View>
      <View style={[styles.barBg, { backgroundColor: colors.border }]}>
        <View style={[styles.barFill, { width: `${Math.min(value, 100)}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

// ─── Info Row ─────────────────────────────────────────────────────────────────

function InfoRow({ icon, label, value, iconColor, colors }: {
  icon: string; label: string; value: string; iconColor: string; colors: any;
}) {
  return (
    <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
      <View style={[styles.infoIconBg, { backgroundColor: iconColor + "18" }]}>
        <IconSymbol name={icon as any} size={15} color={iconColor} />
      </View>
      <Text style={[styles.infoLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

// ─── Feature Card (for welcome screen) ───────────────────────────────────────

function FeatureCard({
  icon,
  title,
  desc,
  iconColor,
  colors,
}: {
  icon: string;
  title: string;
  desc: string;
  iconColor: string;
  colors: any;
}) {
  return (
    <View style={[styles.featureCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.featureIconBg, { backgroundColor: iconColor + "15" }]}>
        <IconSymbol name={icon as any} size={20} color={iconColor} />
      </View>
      <View style={styles.featureTextArea}>
        <Text style={[styles.featureTitle, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.featureDesc, { color: colors.muted }]}>{desc}</Text>
      </View>
    </View>
  );
}

// ─── Step Item (for quick start) ─────────────────────────────────────────────

function StepItem({
  step,
  text,
  colors,
}: {
  step: number;
  text: string;
  colors: any;
}) {
  return (
    <View style={styles.stepRow}>
      <View style={[styles.stepBadge, { backgroundColor: colors.primary + "18" }]}>
        <Text style={[styles.stepNumber, { color: colors.primary }]}>{step}</Text>
      </View>
      <Text style={[styles.stepText, { color: colors.foreground }]}>{text}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function DeviceScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const { connectionStatus, deviceInfo, setDeviceInfo, setConnectionStatus, sshConfig } = useAppStore();

  const refreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const isConnected = connectionStatus === "connected";
  const [refreshing, setRefreshing] = useState(false);
  const [architecture, setArchitecture] = useState<string | undefined>(undefined);

  const fetchDeviceInfo = useCallback(async () => {
    if (!sshService.isConnected) return;
    try {
      const raw = await sshService.getDeviceInfo();
      const temp = parseFloat(raw.temperature || "0");
      const fanRpm = parseInt(raw.fanRpm || "0") || undefined;
      const mem = parseMemInfo(raw.memInfo || "");
      const disk = parseDiskInfo(raw.diskInfo || "");
      const cpu = parseCpuUsage(raw.cpuUsage || "0");
      // GPU usage may come as "45%" or "45" or "N/A"
      const gpuRaw = (raw.gpuUsage || "0").replace(/%/g, "").trim();
      const gpu = gpuRaw === "N/A" ? 0 : parseFloat(gpuRaw);

      setDeviceInfo({
        hostname: raw.hostname || undefined,
        temperature: isNaN(temp) ? undefined : temp,
        fanRpm,
        uptime: raw.uptime || undefined,
        systemVersion: raw.systemVersion || undefined,
        buildNumber: raw.buildNumber || undefined,
        memoryUsed: mem.used,
        memoryTotal: mem.total,
        storageUsed: disk.used,
        storageTotal: disk.total,
        cpuUsage: isNaN(cpu) ? undefined : cpu,
        gpuUsage: isNaN(gpu) ? undefined : gpu,
        lastUpdated: Date.now(),
      });
    } catch (err) {
      console.warn("Failed to fetch device info:", err);
    }
  }, [setDeviceInfo]);

  const fetchArchitecture = useCallback(async () => {
    if (!sshService.isConnected) return;
    try {
      const arch = await sshService.exec("uname -m 2>/dev/null || echo unknown");
      setArchitecture(arch.trim());
    } catch {
      setArchitecture(undefined);
    }
  }, []);

  useEffect(() => {
    if (isConnected) {
      fetchDeviceInfo();
      fetchArchitecture();
      refreshInterval.current = setInterval(fetchDeviceInfo, 3000);
    } else {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
        refreshInterval.current = null;
      }
      setArchitecture(undefined);
    }
    return () => { if (refreshInterval.current) clearInterval(refreshInterval.current); };
  }, [isConnected, fetchDeviceInfo, fetchArchitecture]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDeviceInfo();
    setRefreshing(false);
  };

  const handleConnect = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/connect");
  };

  const handleDisconnect = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await sshService.disconnect();
    setConnectionStatus("disconnected");
    setDeviceInfo({});
    setArchitecture(undefined);
  };

  const statusColor =
    connectionStatus === "connected" ? colors.success :
    connectionStatus === "connecting" ? colors.warning :
    connectionStatus === "error" ? colors.error : colors.muted;

  const statusText =
    connectionStatus === "connected" ? t("device.connected") :
    connectionStatus === "connecting" ? t("device.connecting") :
    t("device.notConnected");

  const temp = deviceInfo.temperature;
  const fanRpm = deviceInfo.fanRpm;
  const memPct = deviceInfo.memoryTotal ? (deviceInfo.memoryUsed! / deviceInfo.memoryTotal) * 100 : 0;
  const diskPct = deviceInfo.storageTotal ? (deviceInfo.storageUsed! / deviceInfo.storageTotal) * 100 : 0;

  const isConfigured = !!(sshConfig.host && sshConfig.username);

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          isConnected ? (
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          ) : undefined
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.pageTitle, { color: colors.foreground }]}>{t("device.title")}</Text>
            {deviceInfo.hostname && (
              <Text style={[styles.hostname, { color: colors.muted }]}>{deviceInfo.hostname}</Text>
            )}
          </View>
          <View style={[styles.statusPill, { backgroundColor: statusColor + "18", borderColor: statusColor + "44" }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
          </View>
        </View>

        {/* ── Connect / Disconnect ── */}
        {!isConnected ? (
          <TouchableOpacity
            style={[styles.connectBtn, { backgroundColor: colors.primary }]}
            onPress={handleConnect}
            activeOpacity={0.85}
          >
            <IconSymbol name="connect" size={20} color="#fff" />
            <Text style={styles.connectBtnText}>{t("connect.connect")}</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.connectedBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.connectedDot, { backgroundColor: colors.success }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.connectedHost, { color: colors.foreground }]}>
                {sshConfig.host}:{sshConfig.port}
              </Text>
              <Text style={[styles.connectedUser, { color: colors.muted }]}>{sshConfig.username}</Text>
            </View>
            <TouchableOpacity
              style={[styles.disconnectBtn, { borderColor: colors.error + "66" }]}
              onPress={handleDisconnect}
            >
              <Text style={[styles.disconnectText, { color: colors.error }]}>{t("connect.disconnect")}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Not connected: Rich welcome UI ── */}
        {!isConnected && (
          <>
            {/* Welcome hero */}
            <View style={styles.welcomeArea}>
              <View style={[styles.welcomeIconCircle, { backgroundColor: colors.primary + "12" }]}>
                <IconSymbol name="device" size={44} color={colors.primary} />
              </View>
              <Text style={[styles.welcomeTitle, { color: colors.foreground }]}>
                {t("device.welcomeTitle")}
              </Text>
              <Text style={[styles.welcomeSubtitle, { color: colors.muted }]}>
                {t("device.welcomeSubtitle")}
              </Text>
            </View>

            {/* SSH Config preview (if configured) */}
            {isConfigured && (
              <View style={[styles.configPreview, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.configPreviewHeader}>
                  <IconSymbol name="server" size={16} color={colors.primary} />
                  <Text style={[styles.configPreviewTitle, { color: colors.foreground }]}>
                    {t("settings.sshConfig")}
                  </Text>
                </View>
                <View style={[styles.configDivider, { backgroundColor: colors.border }]} />
                <View style={styles.configPreviewRow}>
                  <Text style={[styles.configPreviewLabel, { color: colors.muted }]}>{t("connect.host")}</Text>
                  <Text style={[styles.configPreviewValue, { color: colors.foreground }]}>
                    {sshConfig.host}:{sshConfig.port}
                  </Text>
                </View>
                <View style={styles.configPreviewRow}>
                  <Text style={[styles.configPreviewLabel, { color: colors.muted }]}>{t("connect.username")}</Text>
                  <Text style={[styles.configPreviewValue, { color: colors.foreground }]}>{sshConfig.username}</Text>
                </View>
                <View style={styles.configPreviewRow}>
                  <Text style={[styles.configPreviewLabel, { color: colors.muted }]}>{t("connect.authMethod")}</Text>
                  <Text style={[styles.configPreviewValue, { color: colors.foreground }]}>
                    {sshConfig.authMethod === "privateKey" ? t("connect.authKey") : t("connect.authPassword")}
                  </Text>
                </View>
              </View>
            )}

            {/* Not configured warning */}
            {!isConfigured && (
              <TouchableOpacity
                style={[styles.warningCard, { backgroundColor: colors.warning + "10", borderColor: colors.warning + "40" }]}
                activeOpacity={0.7}
                onPress={() => router.push("/(tabs)/settings" as any)}
              >
                <IconSymbol name="warning" size={20} color={colors.warning} />
                <View style={styles.warningTextArea}>
                  <Text style={[styles.warningTitle, { color: colors.warning }]}>
                    {t("connect.notConfigured")}
                  </Text>
                  <Text style={[styles.warningHint, { color: colors.muted }]}>
                    {t("connect.goConfigureHint")}
                  </Text>
                </View>
                <IconSymbol name="chevron.right" size={18} color={colors.muted} />
              </TouchableOpacity>
            )}

            {/* Feature cards */}
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {t("device.welcomeTitle").split(" ")[0] === "欢迎" ? "功能一览" : "Features"}
            </Text>
            <View style={styles.featureGrid}>
              <FeatureCard
                icon="temperature"
                title={t("device.featureMonitor")}
                desc={t("device.featureMonitorDesc")}
                iconColor={colors.error}
                colors={colors}
              />
              <FeatureCard
                icon="terminal"
                title={t("device.featureTerminal")}
                desc={t("device.featureTerminalDesc")}
                iconColor={colors.success}
                colors={colors}
              />
              <FeatureCard
                icon="folder"
                title={t("device.featureFiles")}
                desc={t("device.featureFilesDesc")}
                iconColor={colors.primary}
                colors={colors}
              />
              <FeatureCard
                icon="install"
                title={t("device.featureInstall")}
                desc={t("device.featureInstallDesc")}
                iconColor={colors.warning}
                colors={colors}
              />
            </View>

            {/* Quick start steps */}
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {t("device.quickStart")}
            </Text>
            <View style={[styles.stepsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <StepItem step={1} text={t("device.quickStartStep1")} colors={colors} />
              <View style={[styles.stepDivider, { backgroundColor: colors.border }]} />
              <StepItem step={2} text={t("device.quickStartStep2")} colors={colors} />
              <View style={[styles.stepDivider, { backgroundColor: colors.border }]} />
              <StepItem step={3} text={t("device.quickStartStep3")} colors={colors} />
            </View>

            {/* Go to settings button */}
            {!isConfigured && (
              <TouchableOpacity
                style={[styles.settingsBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => router.push("/(tabs)/settings" as any)}
                activeOpacity={0.7}
              >
                <IconSymbol name="settings" size={18} color={colors.primary} />
                <Text style={[styles.settingsBtnText, { color: colors.primary }]}>
                  {t("connect.goConfigureHint").includes("设置") ? "前往设置" : "Go to Settings"}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* ── Connected: Device Info ── */}
        {isConnected && (
          <>
            {/* Info card: version, arch, uptime */}
            <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {deviceInfo.systemVersion && (
                <InfoRow icon="info" label={t("device.systemVersion")} value={deviceInfo.systemVersion} iconColor={colors.primary} colors={colors} />
              )}
              {deviceInfo.buildNumber && (
                <InfoRow icon="code" label={t("device.buildNumber")} value={deviceInfo.buildNumber} iconColor={colors.primary} colors={colors} />
              )}
              {architecture && (
                <InfoRow icon="chip" label={t("device.architecture")} value={architecture} iconColor={colors.info ?? colors.primary} colors={colors} />
              )}
              {deviceInfo.uptime && (
                <InfoRow icon="time" label={t("device.uptime")} value={deviceInfo.uptime} iconColor={colors.muted} colors={colors} />
              )}
            </View>

            {/* Stat cards: temperature + fan */}
            <View style={styles.statGrid}>
              {temp !== undefined && (
                <StatCard
                  icon="temperature"
                  label={t("device.temperature")}
                  value={`${temp.toFixed(1)}°C`}
                  iconColor={tempColor(temp, colors)}
                  colors={colors}
                />
              )}
              <StatCard
                icon="fan"
                label={t("device.fanSpeed")}
                value={fanRpm && fanRpm > 0 ? `${fanRpm}` : "—"}
                sub={fanRpm && fanRpm > 0 ? t("device.rpm") : undefined}
                iconColor={colors.primary}
                colors={colors}
                customIcon={<FanIcon rpm={fanRpm} size={22} color={colors.primary} />}
              />
            </View>

            {/* Memory & Storage bars */}
            {deviceInfo.memoryTotal !== undefined && deviceInfo.memoryTotal > 0 && (
              <UsageBar
                icon="memory"
                label={t("device.memory")}
                used={deviceInfo.memoryUsed ?? 0}
                total={deviceInfo.memoryTotal}
                color={usageColor(memPct, colors)}
                colors={colors}
              />
            )}
            {deviceInfo.storageTotal !== undefined && deviceInfo.storageTotal > 0 && (
              <UsageBar
                icon="storage"
                label={t("device.storage")}
                used={deviceInfo.storageUsed ?? 0}
                total={deviceInfo.storageTotal}
                color={usageColor(diskPct, colors)}
                colors={colors}
              />
            )}

            {/* CPU & GPU bars */}
            {deviceInfo.cpuUsage !== undefined && (
              <CpuGpuBar
                icon="cpu"
                label={t("device.cpu")}
                value={deviceInfo.cpuUsage}
                color={usageColor(deviceInfo.cpuUsage, colors)}
                colors={colors}
              />
            )}
            {deviceInfo.gpuUsage !== undefined && (
              <CpuGpuBar
                icon="gpu"
                label={t("device.gpu")}
                value={deviceInfo.gpuUsage}
                color={usageColor(deviceInfo.gpuUsage, colors)}
                colors={colors}
              />
            )}

            {/* Last updated */}
            {deviceInfo.lastUpdated && (
              <Text style={[styles.lastUpdated, { color: colors.muted }]}>
                {t("device.lastUpdated")}: {new Date(deviceInfo.lastUpdated).toLocaleTimeString()}
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40 },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  pageTitle: { fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  hostname: { fontSize: 13, marginTop: 2 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    gap: 5,
    marginTop: 6,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: "600" },
  connectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    borderRadius: 14,
    gap: 8,
    marginBottom: 20,
  },
  connectBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  connectedBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    gap: 10,
  },
  connectedDot: { width: 8, height: 8, borderRadius: 4 },
  connectedHost: { fontSize: 14, fontWeight: "600" },
  connectedUser: { fontSize: 12, marginTop: 2 },
  disconnectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  disconnectText: { fontSize: 13, fontWeight: "600" },

  // ── Welcome (not connected) ──
  welcomeArea: {
    alignItems: "center",
    marginBottom: 24,
    gap: 8,
  },
  welcomeIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  welcomeSubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  configPreview: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 20,
  },
  configPreviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  configPreviewTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  configDivider: {
    height: 0.5,
    marginBottom: 8,
  },
  configPreviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
  },
  configPreviewLabel: {
    fontSize: 13,
  },
  configPreviewValue: {
    fontSize: 13,
    fontWeight: "600",
  },
  warningCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 20,
    gap: 12,
  },
  warningTextArea: {
    flex: 1,
    gap: 2,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  warningHint: {
    fontSize: 12,
    lineHeight: 17,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  featureGrid: {
    gap: 10,
    marginBottom: 24,
  },
  featureCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 14,
  },
  featureIconBg: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  featureTextArea: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  featureDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  stepsCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 20,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumber: {
    fontSize: 13,
    fontWeight: "700",
  },
  stepText: {
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  stepDivider: {
    height: 0.5,
    marginLeft: 40,
    marginVertical: 4,
  },
  settingsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    marginBottom: 8,
  },
  settingsBtnText: {
    fontSize: 15,
    fontWeight: "600",
  },

  // ── Connected state ──
  infoCard: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 0.5,
    gap: 10,
  },
  infoIconBg: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  infoLabel: { fontSize: 13, flex: 1 },
  infoValue: { fontSize: 13, fontWeight: "600", maxWidth: "55%" as any, textAlign: "right" },
  statGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    alignItems: "flex-start",
    gap: 4,
  },
  statIconBg: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  statLabel: { fontSize: 11, fontWeight: "500" },
  statValue: { fontSize: 22, fontWeight: "700", letterSpacing: -0.5 },
  statSub: { fontSize: 11 },
  usageCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    gap: 8,
  },
  usageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  usageLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  usageIconBg: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  usageLabel: { fontSize: 14, fontWeight: "600" },
  usagePct: { fontSize: 15, fontWeight: "700" },
  barBg: { height: 6, borderRadius: 3, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3 },
  usageSub: { fontSize: 12 },
  cpuCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    gap: 8,
  },
  lastUpdated: {
    fontSize: 11,
    textAlign: "center",
    marginTop: 4,
  },
});
