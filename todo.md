# CommaConnect TODO

## Phase 1 — Foundation
- [x] Update theme colors (dark tech theme)
- [x] Install required packages (ssh2, i18n, react-native-ssh-sftp)
- [x] Create i18n framework (zh/en)
- [x] Create SSH service layer (singleton connection manager, native Android/iOS)
- [x] Create global store (Zustand: connection state, settings, language)
- [x] Update app.config.ts branding
- [x] Generate app icon/logo

## Phase 2 — Navigation & Shell
- [x] Set up 7-tab navigation with icons
- [x] Create Connect modal/screen
- [x] SSH connection with background persistence

## Phase 3 — Device Screen
- [x] Device info page layout
- [x] SSH commands for temp/memory/storage/CPU/GPU
- [x] Auto-refresh every 3 seconds
- [x] Status cards with color-coded indicators

## Phase 4 — Terminal Screen
- [x] Terminal emulator component
- [x] Keyboard toolbar (Tab, Ctrl, arrows)
- [x] Background session persistence (module-level globals)

## Phase 5 — File Manager
- [x] SFTP file browser
- [x] File upload (phone → device)
- [x] File download (device → phone)
- [x] Rename / delete
- [x] Code editor with inline editing
- [x] File preview

## Phase 6 — Install Screen
- [x] Repository settings integration
- [x] GitHub/Gitee branch list API
- [x] Local sandbox cache (max 2 branches)
- [x] Download progress UI
- [x] Push & install to device

## Phase 7 — Logs Screen
- [x] Real-time log streaming via SSH
- [x] Log level filter
- [x] Save log to local file
- [x] AI analysis (error summary + fix suggestions)
- [x] Apply fix button

## Phase 8 — CAN Data Screen
- [x] Start/stop CAN capture
- [x] Live message display
- [x] In-memory buffer (cleared on exit)
- [x] Export to phone storage (CSV)
- [x] AI CAN signal analysis

## Phase 9 — Settings Screen
- [x] SSH connection settings
- [x] Language toggle (zh/en)
- [x] Repository management (GitHub/Gitee/custom)
- [x] Theme toggle (dark/light)
- [x] About section

## Phase 10 — Polish & Build
- [x] AI permission boundary (device-only, no phone files)
- [x] Error handling & offline states
- [x] Loading states everywhere
- [x] Fix build errors: remove Node.js events module, fix Buffer usage, set NODE_ENV
- [ ] Build APK (user publishes via Publish button)

## Known Limitations / Future Enhancements
- [ ] SSH key file picker (import from phone storage)
- [ ] Terminal xterm.js full rendering (currently plain text)
- [ ] Branch install upload progress bar (native events)
- [ ] Push notifications for long-running installs
- [x] Fix Android Gradle packaging conflict: META-INF duplicate files (jsch vs jspecify)
- [x] Fix install page: paginate GitHub/Gitee API to fetch all branches (not just 30)
- [x] Fix install page: show full branch name without truncation
- [x] Fix install page: support custom Git bare repos (Alibaba Cloud, SSH git@, git://)
- [x] New app icon: white background with black comma (official style)
- [x] UI redesign: young/fresh color scheme, modern cards
- [x] SSH fix: support private key input in settings, connect button connects directly without re-prompting
- [x] Device page: all metrics with icons (fan animation when spinning), architecture display
- [x] Install page: paginate all branches, full branch name display, bare repo support, filter by device arch
- [x] Install page: add branch search bar (real-time filter by branch name)
- [x] Fix web preview crash: change web output from "static" to "single" to avoid SSR native module crash
- [x] Mock react-native-reanimated and react-native-worklets for web platform
- [x] Fix device page: show rich placeholder UI when not connected (not just empty "暂无数据")
- [ ] Fix SSH connection: connection fails immediately when user taps connect button
- [x] Improve settings SSH modal: add explicit auth method toggle (Password/Private Key), show only relevant input based on selection
- [x] Fix terminal: input command has no response, output not displayed
- [x] Fix logs: log collection shows empty, no output displayed
- [x] Fix CAN message capture: use dump.py can --json for openpilot native CAN capture
- [x] Fix connection status sync: App still shows connected after device disconnects
- [x] Fix installation page: ExponentFileSystem.makeDirectoryAsync crash (NoClassDefFoundError)
- [x] Fix install page: repo name at top disappears after branches load (header area gets compressed)
- [x] Fix custom repo branch fetch: private git server (http://IP/repo.git format) fails to fetch branches - need to use SSH git ls-remote instead of GitHub/Gitee REST API
- [x] Fix terminal UI: black background with green text, proper terminal styling
- [x] Fix terminal input: KeyboardAvoidingView prevents keyboard from covering input area
- [x] Fix device disconnect status: heartbeat detection + global disconnect listener in root layout
- [x] Fix terminal: complete rewrite with proper hooks and styling
- [x] Fix device page: GPU usage parsing improved (handles % suffix and N/A), always shown
- [x] Fix device page: fan speed properly parsed and displayed with RPM unit
- [x] Improve CAN capture: use dump.py can --json instead of candump (openpilot native method)
- [x] Fix install page: makeDirectoryAsync wrapped in try-catch to prevent crash
- [x] Fix i18n: all error popups/alerts now show Chinese text in Chinese mode (connect, files, logs, CAN, install)
- [x] Update app icon: deep navy blue background with white comma + WiFi signal arcs (matching user reference)

## Round 3 Bug Fixes (User Feedback 2026-04-16)
- [x] Fix app icon: regenerated with padding, compressed with pngquant
- [x] Fix terminal/logs/CAN: changed ALL text to WHITE on dark background
- [x] Fix terminal: improved KeyboardAvoidingView for keyboard coverage
- [x] Fix install page: completely bypassed expo-file-system, install via SSH wget on device
- [x] Fix custom repo (阿里云): branch fetch now uses SSH git ls-remote on device
- [x] Fix logs: changed log command to openpilot logcatd instead of systemd journalctl
- [x] Fix background disconnect: added AppState listener to detect and handle background->foreground reconnection
- [x] Fix install error messages: wrapped in Chinese-friendly error text
- [x] Fix files/logs/CAN export: removed expo-file-system dependency, save via SSH to device /tmp

## Round 4 Bug Fixes (User Feedback 2026-04-16)
- [ ] Fix AI analysis: error message "Analysis failed. Please check your connection." is still in English, should be Chinese
- [ ] Fix AI analysis: backend API connection may be failing or timing out
- [ ] Improve AI analysis: add retry mechanism and better error handling
- [x] Fix install download: changed to git clone method (works for all repo types)
- [x] Fix install download: added progress display (50%, 75%, 85%, 100%)
- [x] Fix install download: verify file creation and size > 0

## Round 5 Feature Improvements (User Request 2026-04-16)
- [x] Change install progress: real-time percentage via git clone progress polling
- [x] Add backup feature: tar.gz /data/openpilot (excluding .git), only keep latest 1 backup
- [x] Add restore feature: delete current openpilot, extract backup tar.gz
- [x] Add real-time progress display for backup and restore (file size polling)
- [x] Add reboot dialog: "Reboot Now" (sudo reboot) or "Reboot Later" buttons
- [x] Install via git clone directly to /data/openpilot (no zip, no wget, no expo-file-system)
