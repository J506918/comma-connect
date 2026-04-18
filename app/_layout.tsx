import "@/global.css";
import "@/lib/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
if (Platform.OS !== 'web') {
  require('react-native-reanimated');
}
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";

import { trpc, createTRPCClient } from "@/lib/trpc";
import { useAppStore } from "@/lib/store";
import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/_core/manus-runtime";
import { sshService } from "@/lib/ssh-service";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const loadSettings = useAppStore((s) => s.loadSettings);
  const language = useAppStore((s) => s.language);
  const { setConnectionStatus, setDeviceInfo } = useAppStore();

  // Subscribe to SSH service events for real-time connection status sync
  useEffect(() => {
    const handleConnected = () => {
      setConnectionStatus("connected");
    };
    const handleDisconnected = () => {
      setConnectionStatus("disconnected");
      setDeviceInfo({});
    };
    const handleError = (err: any) => {
      setConnectionStatus("error", err?.message || "连接错误");
    };

    sshService.on("connected", handleConnected);
    sshService.on("disconnected", handleDisconnected);
    sshService.on("error", handleError);

    return () => {
      sshService.off("connected", handleConnected);
      sshService.off("disconnected", handleDisconnected);
      sshService.off("error", handleError);
    };
  }, [setConnectionStatus, setDeviceInfo]);

  // Monitor AppState: when app returns to foreground, check SSH connection health
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        // App came back to foreground — verify SSH is still alive
        if (sshService.isConnected) {
          try {
            await sshService.exec("echo 1");
          } catch {
            // Connection is dead, force disconnect to update UI
            try { await sshService.disconnect(); } catch {}
          }
        }
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    import("@/lib/i18n").then((mod) => {
      if (mod.default.language !== language) {
        mod.default.changeLanguage(language);
      }
    });
  }, [language]);

  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);

  // Initialize Manus runtime for cookie injection from parent container
  useEffect(() => {
    initManusRuntime();
  }, []);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  // Create clients once and reuse them
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Disable automatic refetching on window focus for mobile
            refetchOnWindowFocus: false,
            // Retry failed requests once
            retry: 1,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());

  // Ensure minimum 8px padding for top and bottom on mobile
  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          {/* Default to hiding native headers so raw route segments don't appear (e.g. "(tabs)", "products/[id]"). */}
          {/* If a screen needs the native header, explicitly enable it and set a human title via Stack.Screen options. */}
          {/* in order for ios apps tab switching to work properly, use presentation: "fullScreenModal" for login page, whenever you decide to use presentation: "modal*/}
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="oauth/callback" />
            <Stack.Screen
              name="connect"
              options={{ presentation: "modal", headerShown: false }}
            />
          </Stack>
          <StatusBar style="light" backgroundColor="#0D1117" />
        </QueryClientProvider>
      </trpc.Provider>
    </GestureHandlerRootView>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>
    </ThemeProvider>
  );
}
