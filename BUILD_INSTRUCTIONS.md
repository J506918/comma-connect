# CommaConnect APK 构建指南

## 快速开始

### 1. 下载项目代码

```bash
git clone https://github.com/YOUR_USERNAME/comma-connect.git
cd comma-connect
```

### 2. 本地构建（需要 Java 和 Android SDK）

#### 环境要求
- **Node.js 22+** 
- **pnpm 9.12.0+**
- **Java Development Kit (JDK) 17+**
- **Android SDK API 34+**
- **Android Build Tools 34.0.0+**

#### 安装依赖

```bash
# 安装 pnpm（如果未安装）
npm install -g pnpm

# 安装项目依赖
pnpm install
```

#### 构建 APK

```bash
# 预构建（生成 Android 原生代码）
pnpm expo prebuild --clean --platform android

# 进入 Android 目录
cd android

# 构建生产版本 APK
./gradlew assembleRelease

# 或构建调试版本 APK
./gradlew assembleDebug
```

#### 输出文件

- **生产版本**：`android/app/build/outputs/apk/release/app-release.apk`
- **调试版本**：`android/app/build/outputs/apk/debug/app-debug.apk`

### 3. 使用 GitHub Actions 构建（推荐）

#### 步骤 1：上传到 GitHub

```bash
# 初始化 Git 仓库（如果还未初始化）
git init
git add .
git commit -m "Initial commit"

# 添加远程仓库
git remote add origin https://github.com/YOUR_USERNAME/comma-connect.git

# 推送到 GitHub
git branch -M main
git push -u origin main
```

#### 步骤 2：启用 GitHub Actions

1. 在 GitHub 仓库页面，点击 **Settings** → **Actions** → **General**
2. 确保 **Actions permissions** 设置为 **Allow all actions and reusable workflows**

#### 步骤 3：触发构建

**方式 A：自动构建**
- 每次推送到 `main` 或 `master` 分支时自动构建

**方式 B：手动构建**
1. 在 GitHub 仓库页面，点击 **Actions**
2. 选择 **Build APK (Production)**
3. 点击 **Run workflow** → **Run workflow**

#### 步骤 4：下载 APK

1. 构建完成后，点击对应的 workflow run
2. 在 **Artifacts** 部分下载 `app-release`
3. 解压后获得 `app-release.apk`

### 4. 安装到手机

```bash
# 使用 adb 安装（需要 Android SDK Platform Tools）
adb install app-release.apk

# 或直接在手机上打开 APK 文件安装
```

## 常见问题

### Q: 构建失败，提示 "gradle not found"
**A:** 确保已运行 `pnpm expo prebuild --clean --platform android`，这会生成 Android 项目结构。

### Q: 如何签名 APK？
**A:** 生产版本 APK 需要签名密钥。在 GitHub Actions 中，可以添加签名密钥到 Secrets：
1. 在 GitHub 仓库 **Settings** → **Secrets and variables** → **Actions**
2. 添加 `KEYSTORE_FILE` 和 `KEYSTORE_PASSWORD` 等密钥
3. 在工作流文件中使用这些密钥

### Q: 构建需要多长时间？
**A:** 首次构建 10-15 分钟，后续构建 5-10 分钟（取决于网络速度）。

### Q: 如何在本地调试？
**A:** 使用 Expo Go：
```bash
pnpm dev
# 扫描 QR 码在手机上打开应用
```

## 环境变量配置

如果需要配置环境变量（如 API 基础 URL），在项目根目录创建 `.env` 文件：

```env
EXPO_PUBLIC_API_BASE_URL=https://your-api-server.com
EXPO_PUBLIC_OAUTH_PORTAL_URL=https://your-oauth-portal.com
```

## 支持

如有问题，请检查：
1. Node.js 版本：`node --version`（应为 22+）
2. pnpm 版本：`pnpm --version`（应为 9.12.0+）
3. Java 版本：`java -version`（应为 17+）
4. Android SDK：`$ANDROID_HOME/platforms` 中应有 `android-34`

## 下一步

- 修改应用名称：编辑 `app.config.ts` 中的 `appName`
- 修改应用图标：替换 `assets/images/icon.png`
- 自定义主题：编辑 `theme.config.js`
