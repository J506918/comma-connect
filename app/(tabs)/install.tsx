import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  TextInput,
  Alert,
  Platform,
  ScrollView,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import { useAppStore } from "@/lib/store";
import { sshService } from "@/lib/ssh-service";
import { IconSymbol } from "@/components/ui/icon-symbol";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { StyleSheet } from "react-native";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Branch {
  name: string;
  sha?: string;
  date?: string;
}

interface BackupInfo {
  exists: boolean;
  filename?: string;
  size?: string;
  date?: string;
}

interface Repository {
  id: string;
  type: "github" | "gitee" | "custom";
  name: string;
  url?: string;
  owner?: string;
  repo?: string;
}

// ─── Branch Fetching ──────────────────────────────────────────────────────────

async function fetchGitHubBranches(owner: string, repo: string): Promise<Branch[]> {
  const all: Branch[] = [];
  let page = 1;
  while (true) {
    const url = `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100&page=${page}`;
    const res = await fetch(url, { headers: { "User-Agent": "CommaConnect/1.0" } });
    if (!res.ok) throw new Error(`GitHub API 错误: ${res.status}`);
    const data: any[] = await res.json();
    if (!data.length) break;
    for (const b of data) {
      all.push({
        name: b.name,
        sha: b.commit?.sha || "",
        date: b.commit?.commit?.committer?.date || b.commit?.date || "",
      });
    }
    if (data.length < 100) break;
    page++;
  }
  return all;
}

async function fetchGiteeBranches(owner: string, repo: string): Promise<Branch[]> {
  const all: Branch[] = [];
  let page = 1;
  while (true) {
    const url = `https://gitee.com/api/v5/repos/${owner}/${repo}/branches?per_page=100&page=${page}`;
    const res = await fetch(url, { headers: { "User-Agent": "CommaConnect/1.0" } });
    if (!res.ok) throw new Error(`Gitee API 错误: ${res.status}`);
    const data: any[] = await res.json();
    if (!data.length) break;
    for (const b of data) {
      all.push({
        name: b.name,
        sha: b.commit?.sha || "",
        date: b.commit?.commit?.committer?.date || b.commit?.date || "",
      });
    }
    if (data.length < 100) break;
    page++;
  }
  return all;
}

async function fetchCustomBranches(repo: Repository): Promise<Branch[]> {
  const url = repo.url || "";
  if (sshService.isConnected) {
    try {
      const urls = [url];
      if (!url.endsWith(".git")) urls.push(url + ".git");
      if (url.endsWith(".git")) urls.push(url.replace(/\.git$/, ""));
      for (const tryUrl of urls) {
        try {
          const result = await sshService.exec(`git ls-remote --heads "${tryUrl}" 2>/dev/null`);
          if (result && result.trim() && !result.includes("fatal:") && !result.includes("error:")) {
            const lines = result.trim().split("\n").filter(Boolean);
            const branches = lines.map((line) => {
              const parts = line.split("\t");
              const sha = parts[0]?.trim() || "";
              const ref = parts[1]?.trim() || "";
              const name = ref.replace(/^refs\/heads\//, "");
              return { name, sha };
            });
            if (branches.length > 0) return branches;
          }
        } catch {}
      }
    } catch {}
  }
  throw new Error("无法获取分支列表。请确保仓库地址正确，或通过 SSH 连接设备后重试。");
}

async function fetchBranches(repo: Repository): Promise<Branch[]> {
  if (repo.type === "github" && repo.owner && repo.repo) {
    return fetchGitHubBranches(repo.owner, repo.repo);
  } else if (repo.type === "gitee" && repo.owner && repo.repo) {
    return fetchGiteeBranches(repo.owner, repo.repo);
  } else {
    return fetchCustomBranches(repo);
  }
}

function getRepoUrl(repo: Repository): string {
  if (repo.type === "github" && repo.owner && repo.repo) {
    return `https://github.com/${repo.owner}/${repo.repo}.git`;
  } else if (repo.type === "gitee" && repo.owner && repo.repo) {
    return `https://gitee.com/${repo.owner}/${repo.repo}.git`;
  } else if (repo.url) {
    return repo.url.endsWith(".git") ? repo.url : repo.url + ".git";
  }
  return "";
}

function archToBranchKeyword(arch: string): string | null {
  const a = arch.toLowerCase();
  if (a.includes("aarch64") || a.includes("arm64")) return "tici";
  if (a.includes("armv7")) return "eon";
  return null;
}

// ─── Operation Types ─────────────────────────────────────────────────────────

type OperationType = "install" | "backup" | "restore";
type OperationStep = "idle" | "running" | "success" | "error" | "reboot_prompt";

export default function InstallScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const { repositories, connectionStatus } = useAppStore();
  const isConnected = connectionStatus === "connected";

  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [deviceArch, setDeviceArch] = useState<string | null>(null);
  const [archFilter, setArchFilter] = useState(false);

  // Operation modal state
  const [opType, setOpType] = useState<OperationType>("install");
  const [opStep, setOpStep] = useState<OperationStep>("idle");
  const [opProgress, setOpProgress] = useState(0);
  const [opMessage, setOpMessage] = useState("");
  const [opError, setOpError] = useState<string | null>(null);
  const [opBranchName, setOpBranchName] = useState("");
  const [opModalVisible, setOpModalVisible] = useState(false);

  // Backup state
  const [backupInfo, setBackupInfo] = useState<BackupInfo>({ exists: false });
  const [loadingBackup, setLoadingBackup] = useState(false);

  // Progress polling ref
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (repositories.length > 0 && !selectedRepo) {
      setSelectedRepo(repositories[0]);
    }
  }, [repositories]);

  useEffect(() => {
    if (selectedRepo) {
      loadBranches(selectedRepo);
      setSearchQuery("");
    }
  }, [selectedRepo]);

  useEffect(() => {
    if (isConnected && sshService.isConnected) {
      sshService.exec("uname -m 2>/dev/null").then((arch) => {
        setDeviceArch(arch.trim());
      }).catch(() => setDeviceArch(null));
      checkBackup();
    } else {
      setDeviceArch(null);
      setArchFilter(false);
      setBackupInfo({ exists: false });
    }
  }, [isConnected]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, []);

  const loadBranches = async (repo: Repository) => {
    setLoadingBranches(true);
    setBranchError(null);
    setBranches([]);
    try {
      const list = await fetchBranches(repo);
      list.sort((a, b) => {
        if (a.date && b.date) return new Date(b.date).getTime() - new Date(a.date).getTime();
        return a.name.localeCompare(b.name);
      });
      setBranches(list);
    } catch (err: any) {
      setBranchError(err.message);
    } finally {
      setLoadingBranches(false);
    }
  };

  const filteredBranches = useMemo(() => {
    let list = branches;
    if (archFilter && deviceArch) {
      const keyword = archToBranchKeyword(deviceArch);
      if (keyword) {
        list = list.filter((b) => b.name.toLowerCase().includes(keyword.toLowerCase()));
      }
    }
    if (searchQuery) {
      list = list.filter((b) => b.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return list;
  }, [branches, searchQuery, archFilter, deviceArch]);

  const archKeyword = deviceArch ? archToBranchKeyword(deviceArch) : null;

  // ─── Check Backup ──────────────────────────────────────────────────────────

  const checkBackup = async () => {
    if (!sshService.isConnected) return;
    setLoadingBackup(true);
    try {
      const result = await sshService.exec(
        `ls -la /data/openpilot_backup.tar.gz 2>/dev/null && echo BACKUP_EXISTS || echo NO_BACKUP`
      );
      if (result.includes("BACKUP_EXISTS")) {
        const lines = result.trim().split("\n");
        const infoLine = lines.find((l) => l.includes("openpilot_backup"));
        let size = "";
        let date = "";
        if (infoLine) {
          const parts = infoLine.trim().split(/\s+/);
          if (parts.length >= 5) {
            const bytes = parseInt(parts[4], 10);
            if (!isNaN(bytes)) {
              size = bytes > 1024 * 1024 * 1024
                ? `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
                : bytes > 1024 * 1024
                ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
                : `${(bytes / 1024).toFixed(0)} KB`;
            }
            // Date parts: month day time or month day year
            if (parts.length >= 8) {
              date = `${parts[5]} ${parts[6]} ${parts[7]}`;
            }
          }
        }
        setBackupInfo({ exists: true, filename: "openpilot_backup.tar.gz", size, date });
      } else {
        setBackupInfo({ exists: false });
      }
    } catch {
      setBackupInfo({ exists: false });
    } finally {
      setLoadingBackup(false);
    }
  };

  // ─── Start Progress Polling ────────────────────────────────────────────────
  // For git clone: poll /tmp/cc_git_progress file written by git's progress output
  // For backup/restore: poll file size growth

  const startProgressPolling = (type: "clone" | "backup" | "restore") => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);

    progressTimerRef.current = setInterval(async () => {
      try {
        if (type === "clone") {
          // Read git clone progress from stderr redirected file
          const raw = await sshService.exec(`cat /tmp/cc_git_progress 2>/dev/null | tail -1`);
          // Git progress lines look like: "Receiving objects:  45% (1234/2743)"
          const match = raw.match(/(\d+)%/);
          if (match) {
            const pct = parseInt(match[1], 10);
            // Map git progress (0-100) to our range (5-85)
            setOpProgress(Math.min(85, 5 + Math.round(pct * 0.8)));
          }
        } else if (type === "backup") {
          // Check tar.gz file size growth
          const raw = await sshService.exec(`stat -c%s /data/openpilot_backup.tar.gz 2>/dev/null || echo 0`);
          const currentSize = parseInt(raw.trim(), 10) || 0;
          // Estimate total ~2GB for openpilot, compressed ~500MB
          const estimatedTotal = 500 * 1024 * 1024;
          const pct = Math.min(90, Math.round((currentSize / estimatedTotal) * 90));
          setOpProgress(Math.max(opProgress, pct));
        } else if (type === "restore") {
          // Check /data/openpilot directory size growth
          const raw = await sshService.exec(`du -sb /data/openpilot 2>/dev/null | cut -f1 || echo 0`);
          const currentSize = parseInt(raw.trim(), 10) || 0;
          const estimatedTotal = 2 * 1024 * 1024 * 1024; // ~2GB
          const pct = Math.min(90, Math.round((currentSize / estimatedTotal) * 90));
          setOpProgress(Math.max(opProgress, pct));
        }
      } catch {
        // Ignore polling errors
      }
    }, 2000);
  };

  const stopProgressPolling = () => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  // ─── Install Branch ────────────────────────────────────────────────────────

  const handleInstall = async (branch: Branch) => {
    if (!selectedRepo || !sshService.isConnected) return;

    setOpType("install");
    setOpBranchName(branch.name);
    setOpStep("running");
    setOpProgress(0);
    setOpError(null);
    setOpMessage(t("install.downloading"));
    setOpModalVisible(true);

    try {
      const repoUrl = getRepoUrl(selectedRepo);
      if (!repoUrl) throw new Error("无法确定仓库 URL");

      // Step 1: Clean up and start git clone directly to /data/openpilot
      setOpMessage(t("install.downloading"));
      setOpProgress(2);

      // Remove old openpilot and clone new branch directly
      // Use git's progress output redirected to a file for real-time tracking
      const cloneCmd = [
        `rm -rf /tmp/cc_git_progress`,
        `rm -rf /data/openpilot_new`,
        `git clone --depth 1 --single-branch --progress --branch "${branch.name}" "${repoUrl}" /data/openpilot_new 2>/tmp/cc_git_progress`,
        `echo CLONE_OK`,
      ].join(" && ");

      // Start polling progress
      startProgressPolling("clone");

      const cloneResult = await sshService.exec(cloneCmd);
      stopProgressPolling();

      if (!cloneResult.includes("CLONE_OK")) {
        // Read error details
        const errLog = await sshService.exec(`cat /tmp/cc_git_progress 2>/dev/null | tail -5`);
        throw new Error(`克隆失败：${errLog || "未知错误"}`);
      }

      setOpProgress(85);
      setOpMessage(t("install.installingOnDevice"));

      // Step 2: Swap directories atomically
      const swapCmd = [
        `rm -rf /data/openpilot_old`,
        `mv /data/openpilot /data/openpilot_old 2>/dev/null || true`,
        `mv /data/openpilot_new /data/openpilot`,
        `rm -rf /data/openpilot_old`,
        `echo SWAP_OK`,
      ].join(" && ");

      const swapResult = await sshService.exec(swapCmd);
      if (!swapResult.includes("SWAP_OK")) {
        throw new Error("安装失败：无法替换 /data/openpilot 目录");
      }

      setOpProgress(100);
      setOpStep("reboot_prompt");
      setOpMessage(t("install.rebootMessage"));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      stopProgressPolling();
      setOpStep("error");
      setOpError(err.message || "安装失败");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  // ─── Backup ────────────────────────────────────────────────────────────────

  const handleBackup = async () => {
    if (!sshService.isConnected) return;

    setOpType("backup");
    setOpBranchName("");
    setOpStep("running");
    setOpProgress(0);
    setOpError(null);
    setOpMessage(t("install.backingUp"));
    setOpModalVisible(true);

    try {
      // Remove old backup first
      await sshService.exec(`rm -f /data/openpilot_backup.tar.gz 2>/dev/null`);

      setOpProgress(2);
      startProgressPolling("backup");

      // Compress /data/openpilot to tar.gz (excluding .git for speed)
      const backupCmd = [
        `cd /data`,
        `tar -czf openpilot_backup.tar.gz --exclude='.git' openpilot 2>/dev/null`,
        `echo BACKUP_OK`,
      ].join(" && ");

      const result = await sshService.exec(backupCmd);
      stopProgressPolling();

      if (!result.includes("BACKUP_OK")) {
        throw new Error("备份失败：无法压缩 /data/openpilot");
      }

      setOpProgress(100);
      setOpStep("success");
      setOpMessage(t("install.backupSuccess"));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Refresh backup info
      await checkBackup();
    } catch (err: any) {
      stopProgressPolling();
      setOpStep("error");
      setOpError(err.message || "备份失败");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  // ─── Restore ───────────────────────────────────────────────────────────────

  const handleRestore = () => {
    Alert.alert(
      t("install.restoreTitle"),
      t("install.restoreConfirm"),
      [
        { text: t("install.cancel"), style: "cancel" },
        { text: t("install.confirmRestore"), style: "destructive", onPress: doRestore },
      ]
    );
  };

  const doRestore = async () => {
    if (!sshService.isConnected) return;

    setOpType("restore");
    setOpBranchName("");
    setOpStep("running");
    setOpProgress(0);
    setOpError(null);
    setOpMessage(t("install.restoring"));
    setOpModalVisible(true);

    try {
      // Verify backup exists
      const check = await sshService.exec(`test -f /data/openpilot_backup.tar.gz && echo OK || echo MISSING`);
      if (!check.includes("OK")) {
        throw new Error("备份文件不存在");
      }

      setOpProgress(5);
      startProgressPolling("restore");

      // Remove current openpilot and extract backup
      const restoreCmd = [
        `cd /data`,
        `rm -rf openpilot`,
        `tar -xzf openpilot_backup.tar.gz 2>/dev/null`,
        `test -d /data/openpilot && echo RESTORE_OK || echo RESTORE_FAIL`,
      ].join(" && ");

      const result = await sshService.exec(restoreCmd);
      stopProgressPolling();

      if (!result.includes("RESTORE_OK")) {
        throw new Error("还原失败：解压备份文件出错");
      }

      setOpProgress(100);
      setOpStep("reboot_prompt");
      setOpMessage(t("install.rebootMessage"));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      stopProgressPolling();
      setOpStep("error");
      setOpError(err.message || "还原失败");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  // ─── Reboot ────────────────────────────────────────────────────────────────

  const handleReboot = async () => {
    try {
      await sshService.exec("sudo reboot");
      setOpModalVisible(false);
      Alert.alert("", "设备正在重启，请等待设备启动后重新连接。");
    } catch {
      Alert.alert("", "重启命令已发送。");
      setOpModalVisible(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const renderBranch = ({ item }: { item: Branch }) => (
    <TouchableOpacity
      style={[styles.branchItem, { borderBottomColor: colors.border }]}
      onPress={() => handleInstall(item)}
    >
      <View style={styles.branchInfo}>
        <Text style={[styles.branchName, { color: colors.foreground }]} numberOfLines={1}>
          {item.name}
        </Text>
        {item.date && (
          <Text style={[styles.branchDate, { color: colors.muted }]}>
            {new Date(item.date).toLocaleDateString()}
          </Text>
        )}
      </View>
      <TouchableOpacity
        style={[styles.installBtn, { backgroundColor: colors.primary }]}
        onPress={() => handleInstall(item)}
      >
        <IconSymbol name="download" size={14} color="#fff" />
        <Text style={styles.installBtnText}>{t("install.downloadAndInstall")}</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const getOpTitle = () => {
    switch (opType) {
      case "install": return t("install.title");
      case "backup": return t("install.backupTitle");
      case "restore": return t("install.restoreTitle");
    }
  };

  return (
    <ScreenContainer>
      {!isConnected ? (
        <View style={styles.empty}>
          <IconSymbol name="install" size={48} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.muted }]}>{t("install.notConnected")}</Text>
        </View>
      ) : (
        <>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.headerRow}>
              <Text style={[styles.title, { color: colors.foreground }]}>{t("install.title")}</Text>
              <Text style={[styles.branchCount, { color: colors.muted }]}>
                {branches.length > 0 ? `${filteredBranches.length}/${branches.length}` : ""}
              </Text>
            </View>
          </View>

          {/* Repo selector + search + arch filter */}
          <View style={[styles.controls, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.repoButtons}>
              {repositories.map((repo) => (
                <TouchableOpacity
                  key={repo.id}
                  style={[
                    styles.repoBtn,
                    {
                      backgroundColor: selectedRepo?.id === repo.id ? colors.primary : colors.surface2,
                      borderColor: selectedRepo?.id === repo.id ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setSelectedRepo(repo)}
                >
                  <IconSymbol
                    name={repo.type === "github" ? "github" : repo.type === "gitee" ? "repo" : "server"}
                    size={12}
                    color={selectedRepo?.id === repo.id ? "#fff" : colors.muted}
                  />
                  <Text
                    style={[
                      styles.repoBtnText,
                      { color: selectedRepo?.id === repo.id ? "#fff" : colors.foreground },
                    ]}
                    numberOfLines={1}
                  >
                    {repo.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={[styles.searchBar, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
              <IconSymbol name="filter" size={14} color={colors.muted} />
              <TextInput
                style={[styles.searchInput, { color: colors.foreground }]}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={`${t("install.searchBranch")} (${filteredBranches.length} ${t("install.branchCount").replace("{{count}}", "")})`}
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <IconSymbol name="close" size={16} color={colors.muted} />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.chipRow}>
              {isConnected && archKeyword && (
                <TouchableOpacity
                  style={[
                    styles.chip,
                    {
                      backgroundColor: archFilter ? colors.primary + "22" : colors.surface,
                      borderColor: archFilter ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setArchFilter((v) => !v)}
                >
                  <IconSymbol name="chip" size={12} color={archFilter ? colors.primary : colors.muted} />
                  <Text style={[styles.chipText, { color: archFilter ? colors.primary : colors.muted }]}>
                    {archKeyword}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Backup button */}
              <TouchableOpacity
                style={[styles.chip, { backgroundColor: colors.warning + "18", borderColor: colors.warning }]}
                onPress={handleBackup}
              >
                <IconSymbol name="backup" size={12} color={colors.warning} />
                <Text style={[styles.chipText, { color: colors.warning }]}>{t("install.backup")}</Text>
              </TouchableOpacity>

              {/* Restore button */}
              {backupInfo.exists && (
                <TouchableOpacity
                  style={[styles.chip, { backgroundColor: colors.success + "18", borderColor: colors.success }]}
                  onPress={handleRestore}
                >
                  <IconSymbol name="restore" size={12} color={colors.success} />
                  <Text style={[styles.chipText, { color: colors.success }]}>{t("install.restore")}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Backup info */}
            {backupInfo.exists && (
              <View style={[styles.backupInfoBar, { backgroundColor: colors.success + "10", borderColor: colors.success + "30" }]}>
                <IconSymbol name="backup" size={12} color={colors.success} />
                <Text style={[styles.backupInfoText, { color: colors.success }]}>
                  {t("install.backupTime")}: {backupInfo.date || "未知"}
                  {backupInfo.size ? ` · ${backupInfo.size}` : ""}
                </Text>
              </View>
            )}
          </View>

          {/* Branch list */}
          {loadingBranches ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={[styles.emptyText, { color: colors.muted }]}>{t("install.loadingBranches")}</Text>
            </View>
          ) : branchError ? (
            <View style={styles.empty}>
              <IconSymbol name="error" size={40} color={colors.error} />
              <Text style={[styles.emptyText, { color: colors.error }]}>{branchError}</Text>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                onPress={() => selectedRepo && loadBranches(selectedRepo)}
              >
                <Text style={styles.actionBtnText}>{t("common.retry")}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={filteredBranches}
              renderItem={renderBranch}
              keyExtractor={(item) => item.name}
              contentContainerStyle={styles.list}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <IconSymbol name="branch" size={40} color={colors.border} />
                  <Text style={[styles.emptyText, { color: colors.muted }]}>
                    {searchQuery ? `没有匹配 "${searchQuery}" 的分支` : t("install.noBranches")}
                  </Text>
                </View>
              }
              showsVerticalScrollIndicator={false}
            />
          )}
        </>
      )}

      {/* ─── Operation Progress Modal ─────────────────────────────────────── */}
      <Modal
        visible={opModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (opStep === "success" || opStep === "error" || opStep === "reboot_prompt") {
            setOpModalVisible(false);
          }
        }}
      >
        <View style={styles.overlay}>
          <View style={[styles.progressModal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {/* Title */}
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{getOpTitle()}</Text>

            {/* Branch badge (for install only) */}
            {opType === "install" && opBranchName ? (
              <View style={[styles.progressBranchBadge, { backgroundColor: colors.primary + "18" }]}>
                <IconSymbol name="branch" size={14} color={colors.primary} />
                <Text style={[styles.progressBranchName, { color: colors.primary }]} numberOfLines={2}>
                  {opBranchName}
                </Text>
              </View>
            ) : null}

            {/* Progress bar */}
            {opStep === "running" && (
              <View style={styles.progressSection}>
                <Text style={[styles.progressMessage, { color: colors.foreground }]}>{opMessage}</Text>
                <View style={[styles.progressBarBg, { backgroundColor: colors.border + "40" }]}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        backgroundColor: colors.primary,
                        width: `${Math.max(2, opProgress)}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.progressPercent, { color: colors.muted }]}>{opProgress}%</Text>
              </View>
            )}

            {/* Success state */}
            {opStep === "success" && (
              <View style={[styles.resultBox, { backgroundColor: colors.success + "15", borderColor: colors.success + "40" }]}>
                <IconSymbol name="check" size={24} color={colors.success} />
                <Text style={[styles.resultText, { color: colors.success }]}>{opMessage}</Text>
              </View>
            )}

            {/* Error state */}
            {opStep === "error" && (
              <View style={[styles.resultBox, { backgroundColor: colors.error + "15", borderColor: colors.error + "40" }]}>
                <IconSymbol name="error" size={24} color={colors.error} />
                <Text style={[styles.resultText, { color: colors.error }]}>{opError}</Text>
              </View>
            )}

            {/* Reboot prompt */}
            {opStep === "reboot_prompt" && (
              <>
                <View style={[styles.resultBox, { backgroundColor: colors.success + "15", borderColor: colors.success + "40" }]}>
                  <IconSymbol name="check" size={24} color={colors.success} />
                  <Text style={[styles.resultText, { color: colors.success }]}>{opMessage}</Text>
                </View>

                <View style={styles.rebootButtons}>
                  <TouchableOpacity
                    style={[styles.rebootBtn, { backgroundColor: colors.primary }]}
                    onPress={handleReboot}
                  >
                    <IconSymbol name="reboot" size={16} color="#fff" />
                    <Text style={styles.rebootBtnText}>{t("install.rebootNow")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.rebootBtn, { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border }]}
                    onPress={() => setOpModalVisible(false)}
                  >
                    <IconSymbol name="schedule" size={16} color={colors.foreground} />
                    <Text style={[styles.rebootBtnText, { color: colors.foreground }]}>{t("install.rebootLater")}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* Close button for success/error */}
            {(opStep === "success" || opStep === "error") && (
              <TouchableOpacity
                style={[styles.closeBtn, { backgroundColor: colors.primary }]}
                onPress={() => setOpModalVisible(false)}
              >
                <Text style={styles.closeBtnText}>{t("common.close")}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  branchCount: {
    fontSize: 13,
  },
  controls: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
  },
  repoButtons: {
    flexDirection: "row",
    gap: 8,
  },
  repoBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    gap: 5,
  },
  repoBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "500",
  },
  backupInfoBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  backupInfoText: {
    fontSize: 11,
    flex: 1,
  },
  list: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  branchItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    gap: 8,
  },
  branchInfo: {
    flex: 1,
    minWidth: 0,
  },
  branchName: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 2,
  },
  branchDate: {
    fontSize: 10,
  },
  installBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
    flexShrink: 0,
  },
  installBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    minHeight: 200,
  },
  emptyText: {
    fontSize: 14,
    marginTop: 12,
    textAlign: "center",
  },
  actionBtn: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  progressModal: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderTopWidth: 1,
    minHeight: 260,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
  },
  progressBranchBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 20,
    gap: 8,
  },
  progressBranchName: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  progressSection: {
    gap: 10,
    marginBottom: 16,
  },
  progressMessage: {
    fontSize: 14,
    fontWeight: "500",
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  progressPercent: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "right",
  },
  resultBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
    gap: 10,
  },
  resultText: {
    fontSize: 13,
    flex: 1,
    lineHeight: 20,
  },
  rebootButtons: {
    gap: 10,
    marginBottom: 8,
  },
  rebootBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 10,
    gap: 8,
  },
  rebootBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  closeBtn: {
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: "center",
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
});
