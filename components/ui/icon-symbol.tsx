import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<string, ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

const MAPPING: IconMapping = {
  // Navigation / System
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "back": "arrow-back",
  "close": "close",
  "add": "add",
  "check": "check",
  "info": "info",
  "error": "error",
  "warning": "warning",

  // Device / Connection
  "temperature": "thermostat",
  "fan": "air",
  "device": "phone-android",
  "chip": "memory",
  "memory": "memory",
  "storage": "sd-storage",
  "cpu": "developer-board",
  "gpu": "videogame-asset",
  "time": "access-time",
  "terminal": "terminal",
  "connect": "link",
  "disconnect": "link-off",
  "wifi": "wifi",
  "signal": "signal-cellular-alt",

  // Files
  "folder": "folder",
  "file": "insert-drive-file",
  "text": "description",
  "image": "image",
  "code": "code",
  "edit": "edit",
  "delete": "delete",
  "rename": "drive-file-rename-outline",
  "download": "download",
  "upload": "upload",
  "save": "save",
  "copy": "content-copy",

  // Install
  "repo": "source",
  "github": "code",
  "install": "system-update",
  "branch": "account-tree",
  "backup": "backup",
  "restore": "restore",
  "reboot": "restart-alt",
  "schedule": "schedule",

  // Logs
  "logs": "article",
  "play": "play-arrow",
  "stop": "stop",
  "filter": "filter-list",

  // CAN
  "can": "settings-ethernet",
  "export": "ios-share",

  // AI
  "ai": "auto-awesome",
  "analyze": "analytics",

  // Settings
  "settings": "settings",
  "language": "language",
  "theme": "dark-mode",
  "key": "vpn-key",
  "lock": "lock",
  "user": "person",
  "server": "dns",
  "arrow.clockwise": "refresh",
  "exclamationmark.triangle.fill": "warning",
};

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  const mappedName = MAPPING[name] ?? "help-outline";
  return <MaterialIcons color={color} size={size} name={mappedName} style={style} />;
}
