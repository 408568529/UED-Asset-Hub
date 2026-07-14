# UED Asset Hub 发布与 Windows 主机更新流程

适用对象：本机开发代码、GitHub 仓库和 Windows 主机部署同一套 UED Asset Hub。

本文中的命令均为 **单行执行**：只执行该行，等待成功或确认输出后再继续。

## 一、固定目录与数据保护

Windows 主机使用以下目录：

```txt
D:\UED-Asset-Hub-Host\UED-Asset-Hub\  # Git 代码目录
D:\UED-Asset-Hub\runtime-data\         # 真实业务数据目录，不进入 Git
```

主机代码目录中的 `.env.local` 必须保留，并至少包含：

```env
DATA_DIR=D:/UED-Asset-Hub/runtime-data
TRAINING_MEDIA_DIR=D:/UED-Asset-Hub/training-media
TEST_ENV_ENCRYPTION_KEY=仅保存在主机上的随机密钥
ADMIN_USERNAME=admin
ADMIN_PASSWORD=请设置后台密码
ADMIN_SESSION_SECRET=仅保存在主机上的随机长字符串
ADMIN_SESSION_SECURE=false
```

`DATA_DIR` 必须在 Git 代码目录之外。只要该设置不变，更新代码不会覆盖上传的资产、历史记录或测试环境数据。

禁止在主机上使用以下会清理未提交文件的命令：

```txt
git reset --hard
git checkout -- .
```

## 二、本机开发完成后上传 GitHub

### 1. 检查改动

**单行执行：**

```bash
git status
```

确认没有意外的真实数据、`.env.local` 或密钥文件被纳入改动。

### 2. 创建功能分支

**单行执行：** 将 `feature-name` 替换为本次功能名称。

```bash
git switch -c codex/feature-name
```

### 3. 本地验证

**单行执行：**

```bash
npm run typecheck
```

**单行执行：**

```bash
npm run build
```

### 4. 提交与推送

按以下顺序逐行执行。将提交说明替换为本次内容。

```bash
git add -A
```

```bash
git commit -m "Describe this release"
```

```bash
git push -u origin HEAD
```

### 5. 在 GitHub 合并

1. 打开 GitHub 提示的 Pull Request 链接。
2. 确认 `base` 为 `main`，`compare` 为刚推送的 `codex/...` 分支。
3. 创建 Pull Request 并合并到 `main`。
4. 合并完成后可以删除远端功能分支。

## 三、Windows 主机首次改用 SSH 拉取

此步骤只需做一次。完成后，主机更新不需要 GitHub Token，也不依赖 HTTPS/TLS 拉取。

### 1. 生成主机 SSH Key

**单行执行：**

```powershell
ssh-keygen -t ed25519 -C "UED Asset Hub Windows Host"
```

按提示使用默认保存路径。是否设置密钥口令可自行决定；没有管理员权限时可跳过 `ssh-agent` 配置。

### 2. 复制公钥

**单行执行：**

```powershell
Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub" | Set-Clipboard
```

在浏览器打开 <https://github.com/settings/keys>：

1. 点击 `New SSH key`。
2. `Title` 填 `UED Asset Hub Windows Host`。
3. `Key type` 选择 `Authentication Key`。
4. 点击 `Key` 输入框，按 `Ctrl + V` 粘贴。
5. 点击 `Add SSH key`。

只粘贴 `.pub` 公钥；绝不上传或发送 `id_ed25519` 私钥。

### 3. 验证并切换远端

**单行执行：**

```powershell
ssh -T git@github.com
```

首次提示信任 GitHub 时输入 `yes`。看到 `You've successfully authenticated` 即成功。

按以下顺序逐行执行：

```powershell
cd "D:\UED-Asset-Hub-Host\UED-Asset-Hub"
```

```powershell
git config --global core.sshCommand "C:/Windows/System32/OpenSSH/ssh.exe"
```

```powershell
git remote set-url origin git@github.com:408568529/UED-Asset-Hub.git
```

```powershell
git remote -v
```

最后两行应显示 `git@github.com:408568529/UED-Asset-Hub.git`。

## 四、每次更新 Windows 主机代码

### 1. 停止旧服务

在正在运行 `npm run start` 的 PowerShell 窗口按 `Ctrl + C`。

### 2. 进入代码目录并检查状态

**单行执行：**

```powershell
cd "D:\UED-Asset-Hub-Host\UED-Asset-Hub"
```

**单行执行：**

```powershell
git status
```

若且只显示 `package-lock.json` 被修改，才先保留它；工作区干净时直接跳过本步骤：

**单行执行：**

```powershell
git stash push -m "host package lock before update" package-lock.json
```

如果出现其他文件被修改，不要继续拉取，也不要执行 `reset` 或 `checkout`；先确认这些修改来源。

### 3. 拉取已合并的最新代码

**单行执行：**

```powershell
git pull origin main
```

看到 `Fast-forward` 或 `Already up to date` 即成功。

### 4. 重新安装依赖并构建

`npm ci` 会根据 Git 中的 `package-lock.json` 清理并重装 `node_modules`，可处理 Windows 上 Next SWC 原生依赖异常。

**单行执行：**

```powershell
npm ci
```

**单行执行：**

```powershell
npm run build
```

若构建异常，或启动后页面仍像旧版本，再执行以下缓存清理并重新构建；正常更新可以跳过：

```powershell
Remove-Item -Recurse -Force .\.next
```

```powershell
npm run build
```

### 5. 启动新版本

**单行执行：** 此命令会持续运行，不要关闭该窗口。

```powershell
npm run start -- -H 0.0.0.0 -p 3027
```

然后用局域网地址访问：

```txt
http://主机IP:3027
```

## 五、生成临时公网演示链接

使用 Cloudflare Quick Tunnel 可以在不配置域名的情况下，临时生成公网链接。该方式只适合演示和测试：链接随机生成、运行隧道的窗口关闭后即失效，不适合作为长期正式入口。

注意：公网链接会让外部人员访问当前站点。分享前请确认没有敏感资产，后台密码已修改，且不要把主机管理权限交给外部人员。

### 1. 确认 cloudflared 安装位置

当前主机已验证可用的安装位置是：

```txt
C:\Program Files (x86)\cloudflared\cloudflared.exe
```

### 2. 确认工具可用

**单行执行：**

```powershell
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" --version
```

### 3. 启动平台和隧道

在第一个 PowerShell 窗口启动平台，并保持窗口运行：

```powershell
npm run start -- -H 0.0.0.0 -p 3027
```

新开第二个 PowerShell 窗口，执行：

```powershell
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:3027
```

终端会打印一个 `https://随机名称.trycloudflare.com` 地址，复制它即可给外部人员访问。结束演示时，在第二个窗口按 `Ctrl + C`；该链接会立即失效，下次启动会生成新链接。

## 六、更新前备份真实数据（推荐）

代码和数据已经分离，`git pull` 不会覆盖数据。对于重要版本更新，仍建议先备份一次。

**单行执行：**

```powershell
$ts = Get-Date -Format "yyyyMMdd-HHmmss"; Compress-Archive -Path "D:\UED-Asset-Hub\runtime-data\*" -DestinationPath "D:\UED-Asset-Hub\runtime-data-backup-$ts.zip"
```

## 七、常见问题

### `git pull` 失败或 TLS/SSL 报错

确认已完成“第三部分”的 SSH 配置，然后检查：

**单行执行：**

```powershell
ssh -T git@github.com
```

成功后再次执行：

```powershell
git pull origin main
```

不要再输入 GitHub Token，也不需要切回 HTTPS 地址。

### `next-swc... is not a valid Win32 application`

执行第四部分的 `npm ci`，它会安装与当前 Windows 主机匹配的依赖。

### `git pull` 提示本地改动会被覆盖

不要使用强制清理命令。先执行 `git status`，仅当确认是 `package-lock.json` 的本机依赖变动时，按第四部分先 `git stash push ... package-lock.json`，再拉取。
