/**
 * Electron 主进程（优化版 v4 — spawn 子进程方案）
 *
 * 为什么不继续用内嵌 require？
 *   require("next") + startServer() 在主进程加载整个 Next.js 框架，打包后容易
 *   出现白屏（模块加载异常 / config 提取失败）。改为 spawn 子进程运行 Next.js
 *   的 standalone server.js，主进程保持轻量，加载窗口动画流畅。
 *
 * 启动流程：
 *   1. 立即弹出加载窗口（show: true + 背景色兜底）
 *   2. spawn 子进程运行 server.js
 *   3. 快速轮询 HTTP 端口（递增间隔 200ms→2000ms）
 *   4. 就绪后关闭加载窗口 → 显示主窗口
 */
const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

const PORT = 3457;
const isDev = process.env.ELECTRON_DEV === "1";

let mainWindow = null;
let nextProcess = null;

// ============= Chromium 启动参数 =============
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("no-first-run");
app.commandLine.appendSwitch("no-default-browser-check");

// ============= 加载页面 HTML =============
function loadingPageHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
  background:linear-gradient(135deg,#f5f7fa,#e8ecf1);
  height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
  color:#1d1d1f;overflow:hidden;
}
.logo{
  width:80px;height:80px;border-radius:20px;
  background:linear-gradient(135deg,#0A84FF,#0046A8);
  display:flex;align-items:center;justify-content:center;
  margin-bottom:28px;box-shadow:0 8px 32px rgba(10,132,255,0.3);
  animation:pulse 2s ease-in-out infinite;
}
.logo svg{width:44px;height:44px;fill:white;}
h1{font-size:22px;font-weight:600;letter-spacing:-0.3px;margin-bottom:6px;}
p{font-size:14px;color:#86868b;margin-bottom:32px;}
.dots{display:flex;gap:6px;}
.dot{
  width:10px;height:10px;border-radius:50%;background:#0A84FF;
  animation:bounce 1.4s ease-in-out infinite both;
}
.dot:nth-child(1){animation-delay:0s}
.dot:nth-child(2){animation-delay:.16s}
.dot:nth-child(3){animation-delay:.32s}
@keyframes bounce{0%,80%,100%{transform:scale(.6);opacity:.4}40%{transform:scale(1);opacity:1}}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}
.status{font-size:12px;color:#86868b;margin-top:24px;}
</style>
</head>
<body>
<div class="logo"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/><path d="M8 12h8M8 16h6"/></svg></div>
<h1>Doc2Alpaca</h1>
<p>正在加载应用引擎...</p>
<div class="dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
<div class="status" id="s">启动服务中</div>
<script>
const msgs=['加载服务模块…','初始化数据处理引擎…','准备文件解析器…','预热 LLM 连接…','配置路由…','差不多了…'];
let i=0; setInterval(()=>{document.getElementById('s').textContent=msgs[i++%msgs.length]},4000);
</script>
</body>
</html>`;
}

// ============= 启动 Next.js standalone server（spawn 子进程） =============
function startServerProcess() {
  return new Promise((resolve) => {
    // 开发模式：由外部的 next dev 提供 HTTP 服务，无需 spawn
    if (isDev) {
      resolve();
      return;
    }

    const serverDir = path.join(
      process.resourcesPath,
      "app",
      ".next",
      "standalone"
    );
    const serverScript = path.join(serverDir, "server.js");

    // 检查 server.js 是否存在
    const fs = require("fs");
    if (!fs.existsSync(serverScript)) {
      console.error("[main] server.js 不存在:", serverScript);
      resolve(); // resolve 而不是 reject，让应用尝试加载（可能显示错误页）
      return;
    }

    // 生产模式：spawn 子进程运行 standalone server
    // 关键：设置 ELECTRON_RUN_AS_NODE=1，让子进程以纯 Node.js 模式运行
    // 不加载 Electron 窗口代码，避免无限创建窗口
    const env = {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PORT),
      ELECTRON_RUN_AS_NODE: "1",
      DOC2ALPACA_DESKTOP: "true",
    };

    console.log("[main] spawn server:", serverScript);

    nextProcess = spawn(process.execPath, [serverScript], {
      cwd: serverDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    nextProcess.stdout.on("data", (d) => {
      const text = d.toString().trim();
      if (text) console.log("[server]", text);
    });

    nextProcess.stderr.on("data", (d) => {
      const text = d.toString().trim();
      if (text) console.error("[server]", text);
    });

    nextProcess.on("exit", (code, signal) => {
      console.log("[main] server 退出 code=%s signal=%s", code, signal);
      nextProcess = null;
    });

    nextProcess.on("error", (err) => {
      console.error("[main] spawn 失败:", err.message);
      resolve(); // 不阻塞应用
    });

    // 轮询等待服务器就绪
    pollServer(resolve, 0);
  });
}

// ============= 轮询 HTTP 端口 =============
function pollServer(resolve, attempt) {
  const maxAttempts = 120; // 最多等 2 分钟
  const delay = Math.min(200 + attempt * 50, 2000); // 200ms → 2000ms

  if (attempt >= maxAttempts) {
    console.warn("[main] 轮询超时，继续启动窗口（可能白屏）");
    resolve();
    return;
  }

  const req = http.get(`http://localhost:${PORT}`, (res) => {
    // 任何 HTTP 响应都认为服务器就绪
    res.resume();
    console.log("[main] server 就绪 (attempt=%d)", attempt);
    resolve();
  });

  req.on("error", () => {
    // 服务器还没准备好，继续轮询
    req.destroy();
    setTimeout(() => pollServer(resolve, attempt + 1), delay);
  });

  req.setTimeout(3000, () => {
    req.destroy();
    setTimeout(() => pollServer(resolve, attempt + 1), delay);
  });
}

// ============= 创建加载窗口 =============
function createLoadingWindow() {
  const win = new BrowserWindow({
    width: 480,
    height: 360,
    resizable: false,
    frame: false,
    backgroundColor: "#f5f7fa",
    show: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(loadingPageHTML())}`
  );
  return win;
}

// ============= 创建主窗口 =============
async function createMainWindow(loadingWin) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#ffffff",
    title: "Doc2Alpaca",
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (loadingWin && !loadingWin.isDestroyed()) loadingWin.close();
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: "detach" });
  });

  await mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://localhost")) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ============= 菜单 =============
function setupMenu() {
  const isMac = process.platform === "darwin";
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac
        ? [
            {
              label: app.name,
              submenu: [
                { role: "about" },
                { type: "separator" },
                { role: "services" },
                { type: "separator" },
                { role: "hide" },
                { role: "hideOthers" },
                { role: "unhide" },
                { type: "separator" },
                { role: "quit" },
              ],
            },
          ]
        : []),
      {
        label: "文件",
        submenu: [
          {
            label: "批量导入文件…",
            accelerator: "CmdOrCtrl+O",
            click: () => {
              if (mainWindow) {
                mainWindow.webContents.send("menu-batch-import");
              }
            },
          },
          { type: "separator" },
          isMac ? { role: "close" } : { role: "quit" },
        ],
      },
      {
        label: "编辑",
        submenu: [
          { role: "undo", label: "撤销" },
          { role: "redo", label: "重做" },
          { type: "separator" },
          { role: "cut", label: "剪切" },
          { role: "copy", label: "复制" },
          { role: "paste", label: "粘贴" },
          { role: "selectAll", label: "全选" },
        ],
      },
      {
        label: "视图",
        submenu: [
          { role: "reload", label: "重新加载" },
          { role: "forceReload", label: "强制重新加载" },
          { type: "separator" },
          { role: "resetZoom", label: "重置缩放" },
          { role: "zoomIn", label: "放大" },
          { role: "zoomOut", label: "缩小" },
          { type: "separator" },
          { role: "togglefullscreen", label: "全屏" },
          ...(isDev
            ? [{ type: "separator" }, { role: "toggleDevTools", label: "开发者工具" }]
            : []),
        ],
      },
    ])
  );
}

// ============= IPC 处理器 =============
/**
 * 原生文件对话框 — 支持多选文件
 * 渲染进程通过 window.electronApp.openFileDialog() 调用
 */
ipcMain.handle("open-file-dialog", async (event, options) => {
  const defaultFilters = [
    {
      name: "支持的文档",
      extensions: ["pdf", "docx", "pptx", "ppt", "txt", "md", "markdown", "html", "htm"],
    },
    { name: "全部文件", extensions: ["*"] },
  ];

  const result = await dialog.showOpenDialog({
    properties: ["openFile", "multiSelections"],
    filters: options?.filters || defaultFilters,
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths;
});

/**
 * 按路径读取文件（返回 name / data(base64) / mime）
 * 渲染进程通过 window.electronApp.readFilesByPaths() 调用
 */
ipcMain.handle("read-files-by-paths", async (event, filePaths) => {
  if (!Array.isArray(filePaths)) return [];

  const fs = require("fs");
  const path = require("path");

  // MIME 映射
  const mimeMap = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".ppt": "application/vnd.ms-powerpoint",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".html": "text/html",
    ".htm": "text/html",
  };

  const results = [];
  for (const fp of filePaths) {
    try {
      const ext = path.extname(fp).toLowerCase();
      const buffer = await fs.promises.readFile(fp);
      results.push({
        name: path.basename(fp),
        data: buffer.toString("base64"),
        mime: mimeMap[ext] || "application/octet-stream",
      });
    } catch (err) {
      console.error("[main] 读取文件失败:", fp, err.message);
    }
  }
  return results;
});

// ============= 应用入口 =============
app.whenReady().then(async () => {
  setupMenu();

  // 1. 立即弹出加载窗口
  const loadingWin = createLoadingWindow();

  // 2. 启动 Next.js server（spawn 子进程 + 轮询）
  await startServerProcess();

  // 3. 创建主窗口（server 已就绪）
  await createMainWindow(loadingWin);
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const loadingWin = createLoadingWindow();
    startServerProcess().then(() => createMainWindow(loadingWin));
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  // 清理子进程
  if (nextProcess) {
    nextProcess.kill();
    nextProcess = null;
  }
});