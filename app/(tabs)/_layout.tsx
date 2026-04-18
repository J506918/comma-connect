import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform } from "react-native";
import { useTranslation } from "react-i18next";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          paddingTop: 8,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.device"),
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="device" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="terminal"
        options={{
          title: t("tabs.terminal"),
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="terminal" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="files"
        options={{
          title: t("tabs.files"),
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="folder" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="install"
        options={{
          title: t("tabs.install"),
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="install" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="logs"
        options={{
          title: t("tabs.logs"),
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="logs" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="can"
        options={{
          title: t("tabs.can"),
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="can" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("tabs.settings"),
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="settings" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
