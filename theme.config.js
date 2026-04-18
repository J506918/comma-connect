/** @type {const} */
const themeColors = {
  // Fresh, modern iOS-inspired palette with proper light/dark support
  primary:    { light: '#007AFF', dark: '#0A84FF' },   // iOS blue — main action color
  background: { light: '#F2F2F7', dark: '#0C0C0E' },   // iOS system background
  surface:    { light: '#FFFFFF', dark: '#1C1C1E' },   // Cards / elevated surfaces
  surface2:   { light: '#F2F2F7', dark: '#2C2C2E' },   // Secondary surface / input bg
  foreground: { light: '#000000', dark: '#FFFFFF' },   // Primary text
  muted:      { light: '#6E6E73', dark: '#8E8E93' },   // Secondary text
  border:     { light: '#D1D1D6', dark: '#38383A' },   // Dividers / borders
  tint:       { light: '#007AFF', dark: '#0A84FF' },   // Tab bar active tint
  success:    { light: '#34C759', dark: '#30D158' },   // Green — connected / ok
  warning:    { light: '#FF9500', dark: '#FF9F0A' },   // Orange — warm / caution
  error:      { light: '#FF3B30', dark: '#FF453A' },   // Red — error / disconnect
  info:       { light: '#5AC8FA', dark: '#64D2FF' },   // Cyan — info / CAN data
};

module.exports = { themeColors };
