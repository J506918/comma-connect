import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuthMethod = 'password' | 'privateKey';
export type RepoType = 'github' | 'gitee' | 'custom';
export type Language = 'zh' | 'en';
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SSHConfig {
  host: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  password?: string;
  privateKey?: string;
}

export interface RecentConnection {
  id: string;
  host: string;
  port: number;
  username: string;
  lastUsed: number;
}

export interface Repository {
  id: string;
  name: string;
  type: RepoType;
  owner?: string;   // for github/gitee
  repo?: string;    // for github/gitee
  url?: string;     // for custom
}

export interface AppSettings {
  language: Language;
  sshConfig: SSHConfig;
  repositories: Repository[];
  aiApiKey?: string;
}

export interface DeviceInfo {
  hostname?: string;
  temperature?: number;
  fanRpm?: number;
  uptime?: string;
  systemVersion?: string;
  buildNumber?: string;
  memoryUsed?: number;
  memoryTotal?: number;
  storageUsed?: number;
  storageTotal?: number;
  cpuUsage?: number;
  gpuUsage?: number;
  lastUpdated?: number;
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface AppStore {
  // Connection
  connectionStatus: ConnectionStatus;
  connectionError?: string;
  sshConfig: SSHConfig;
  recentConnections: RecentConnection[];

  // Device info
  deviceInfo: DeviceInfo;

  // Settings
  language: Language;
  repositories: Repository[];
  aiApiKey: string | null;

  // Actions
  setConnectionStatus: (status: ConnectionStatus, error?: string) => void;
  setSshConfig: (config: SSHConfig) => void;
  addRecentConnection: (conn: RecentConnection) => void;
  setDeviceInfo: (info: Partial<DeviceInfo>) => void;
  setLanguage: (lang: Language) => void;
  setRepositories: (repos: Repository[]) => void;
  addRepository: (repo: Omit<Repository, 'id'>) => void;
  updateRepository: (repo: Repository) => void;
  removeRepository: (id: string) => void;
  setAiApiKey: (key: string | null) => void;
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
}

const DEFAULT_SSH_CONFIG: SSHConfig = {
  host: '',
  port: 22,
  username: 'comma',
  authMethod: 'privateKey',
  password: '',
  privateKey: '',
};

export const useAppStore = create<AppStore>((set, get) => ({
  // Initial state
  connectionStatus: 'disconnected',
  connectionError: undefined,
  sshConfig: DEFAULT_SSH_CONFIG,
  recentConnections: [],
  deviceInfo: {},
  language: 'zh',
  repositories: [],
  aiApiKey: null,

  // Actions
  setConnectionStatus: (status, error) =>
    set({ connectionStatus: status, connectionError: error }),

  setSshConfig: (config) => {
    set({ sshConfig: config });
    get().saveSettings();
  },

  addRecentConnection: (conn) => {
    const existing = get().recentConnections.filter((c) => c.id !== conn.id);
    const updated = [conn, ...existing].slice(0, 5);
    set({ recentConnections: updated });
    get().saveSettings();
  },

  setDeviceInfo: (info) =>
    set((state) => ({ deviceInfo: { ...state.deviceInfo, ...info } })),

  setLanguage: (lang) => {
    set({ language: lang });
    get().saveSettings();
  },

  setRepositories: (repos) => {
    set({ repositories: repos });
    get().saveSettings();
  },

  addRepository: (repo) => {
    const newRepo: Repository = { ...repo, id: Date.now().toString() };
    const updated = [...get().repositories, newRepo];
    set({ repositories: updated });
    get().saveSettings();
  },

  updateRepository: (repo) => {
    const updated = get().repositories.map((r) => (r.id === repo.id ? repo : r));
    set({ repositories: updated });
    get().saveSettings();
  },

  removeRepository: (id) => {
    const updated = get().repositories.filter((r) => r.id !== id);
    set({ repositories: updated });
    get().saveSettings();
  },

  setAiApiKey: (key) => {
    set({ aiApiKey: key || null });
    get().saveSettings();
  },

  loadSettings: async () => {
    try {
      const raw = await AsyncStorage.getItem('app_settings');
      if (raw) {
        const data = JSON.parse(raw);
        set({
          language: data.language ?? 'zh',
          sshConfig: data.sshConfig ?? DEFAULT_SSH_CONFIG,
          recentConnections: data.recentConnections ?? [],
          repositories: data.repositories ?? [],
              aiApiKey: data.aiApiKey ?? null,
        });
      }
    } catch (e) {
      console.warn('Failed to load settings:', e);
    }
  },

  saveSettings: async () => {
    try {
      const { language, sshConfig, recentConnections, repositories, aiApiKey } = get();
      const data = { language, sshConfig, recentConnections, repositories, aiApiKey };
      await AsyncStorage.setItem('app_settings', JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  },
}));
