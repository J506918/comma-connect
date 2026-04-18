# CommaConnect — UI Design Document

## App Overview
A professional Android app for managing comma devices via SSH. Dark-first theme with a tech/terminal aesthetic.

## Color Palette
- **Background**: `#0D1117` (deep dark, GitHub dark style)
- **Surface**: `#161B22` (card/panel background)
- **Surface2**: `#21262D` (elevated surface, inputs)
- **Primary**: `#58A6FF` (blue accent, links, active states)
- **Success**: `#3FB950` (green, connected, ok)
- **Warning**: `#D29922` (yellow, warnings)
- **Error**: `#F85149` (red, errors, disconnect)
- **Foreground**: `#E6EDF3` (primary text)
- **Muted**: `#8B949E` (secondary text, labels)
- **Border**: `#30363D` (dividers, borders)
- **Terminal**: `#0D1117` bg with `#58A6FF` cursor, `#E6EDF3` text

## Screen List

### 1. Connect Screen (Modal on first launch / no connection)
- SSH host input (IP address)
- Port input (default 22)
- Username input (default root)
- Password / Private Key toggle
- "Connect" button with loading state
- Recent connections list

### 2. Device Screen (Tab 1 — 设备/Device)
- Connection status banner (green/red pill)
- Device name + model
- System info cards (2-column grid):
  - Temperature (CPU temp, color-coded: green/yellow/red)
  - Fan RPM (if available)
  - Uptime
  - System version + build number
- Memory card: circular progress + used/total text
- Storage card: horizontal bar + used/total text
- CPU usage: animated bar chart (per-core or aggregate)
- GPU usage: single bar
- Auto-refresh every 3 seconds

### 3. Terminal Screen (Tab 2 — 窗口/Terminal)
- Full-screen terminal emulator (xterm-style)
- Monospace font, dark background
- Keyboard toolbar: Tab, Ctrl, Arrow keys, common shortcuts
- Session persists in background (even when switching tabs)
- Multiple session support (future)

### 4. Files Screen (Tab 3 — 文件/Files)
- Breadcrumb navigation bar
- File list with icons (folder/file type)
- Long-press context menu: rename, copy, delete, download
- Tap file: preview (text/code) or download prompt
- Upload FAB button (pick from phone)
- Code editor modal: syntax highlighting, save button
- Download progress indicator

### 5. Install Screen (Tab 4 — 安装/Install)
- Repository selector (from settings)
- Branch list (fetched from GitHub/Gitee API)
- Branch item: name, last commit date, cached indicator
- Install button → shows progress steps:
  1. Checking local cache
  2. Downloading branch
  3. Transferring to device
  4. Installing on device
- Cache management: shows 2 cached branches max

### 6. Logs Screen (Tab 5 — 日志/Logs)
- Real-time log stream (auto-scroll)
- Filter bar: log level (error/warn/info/debug)
- Search/highlight text
- Pause/resume stream toggle
- Save to local button
- AI Analyze button → bottom sheet with:
  - Error summary
  - Root cause analysis
  - Suggested fixes (with "Apply Fix" button)

### 7. CAN Screen (Tab 6 — CAN数据/CAN Data)
- Start/Stop capture button (large, prominent)
- Live message counter
- Message list: ID, DLC, data bytes, timestamp
- Filter by CAN ID
- Export button (saves .csv or .asc to phone)
- AI Analyze button → interprets signals
- Data cleared on app exit

### 8. Settings Screen (Tab 7 — 设置/Settings)
- **Connection**: SSH host, port, user, auth method
- **Language**: Chinese / English toggle
- **Repositories**: 
  - GitHub (format: owner/repo)
  - Gitee (format: owner/repo)
  - Custom (full URL)
  - Add/edit/delete
- **AI**: API key input (optional, uses built-in by default)
- **About**: App version, GitHub link

## Key User Flows

### Connect Flow
App opens → no saved connection → Connect modal → fill SSH details → tap Connect → loading → success → Device tab shown

### Install Flow
Settings → add repo → Install tab → select repo → branch list loads → tap branch → "Download & Install" → progress steps → success toast

### Log Analysis Flow
Logs tab → error appears → tap "AI Analyze" → bottom sheet → AI shows root cause → "Apply Fix" → SSH command runs → success

### File Edit Flow
Files tab → navigate to file → tap file → code editor opens → edit → tap Save → file written to device via SFTP

## Navigation Structure
Bottom tab bar with 7 tabs:
```
[设备] [窗口] [文件] [安装] [日志] [CAN] [设置]
```
Icons: monitor, terminal, folder, download, list, activity, gear

## Typography
- Headers: 18px bold, foreground
- Body: 14px regular, foreground  
- Labels: 12px, muted
- Terminal: 13px monospace (JetBrains Mono or Courier)
- Code: 13px monospace

## Component Patterns
- **StatusCard**: icon + label + value, surface background, rounded-xl
- **ProgressBar**: colored fill, percentage label
- **TerminalLine**: monospace, color-coded by log level
- **FileRow**: icon + name + size + date, pressable
- **BranchItem**: name + date + cache badge, pressable
- **AISheet**: bottom sheet with analysis result + action buttons
