/**
 * 手动下载并解压 Electron 二进制（绕过 @electron/get 和 PowerShell 的各种坑）
 */
const https = require("https");
const fs = require("fs");
const path = require("path");

const VERSION = "31.7.7";
const URL = `https://cdn.npmmirror.com/binaries/electron/${VERSION}/electron-v${VERSION}-win32-x64.zip`;
const ELECTRON_DIR = path.resolve(__dirname, "..", "node_modules", "electron");
const ZIP_PATH = path.join(ELECTRON_DIR, "electron.zip");
const DIST_DIR = path.join(ELECTRON_DIR, "dist");

function download(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`[fetch] 下载 ${url}`);
    const file = fs.createWriteStream(dest);
    let total = 0;
    let received = 0;
    let lastLog = 0;

    const get = (u) => {
      https.get(u, (res) => {
        // 处理重定向
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.destroy();
          console.log(`[fetch] 重定向 → ${res.headers.location}`);
          get(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        total = parseInt(res.headers["content-length"] || "0", 10);
        res.on("data", (chunk) => {
          received += chunk.length;
          const now = Date.now();
          if (now - lastLog > 2000) {
            const pct = total ? ((received / total) * 100).toFixed(1) : "?";
            const mb = (received / 1024 / 1024).toFixed(1);
            console.log(`[fetch] ${mb} MB (${pct}%)`);
            lastLog = now;
          }
        });
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
      }).on("error", reject);
    };
    get(url);
  });
}

async function extractZip(zipPath, destDir) {
  const { execFileSync } = require("child_process");
  // 清空目标目录
  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
  }
  fs.mkdirSync(destDir, { recursive: true });
  console.log(`[extract] 用 tar 解压到 ${destDir}`);
  // Windows 10+ 自带 tar.exe，能正确解压 zip，比 extract-zip/Expand-Archive 都可靠
  execFileSync("tar", ["-xf", zipPath, "-C", destDir], { stdio: "inherit" });
  console.log("[extract] 完成");
}

(async () => {
  try {
    await download(URL, ZIP_PATH);
    await extractZip(ZIP_PATH, DIST_DIR);

    // 写入 path.txt
    fs.writeFileSync(path.join(ELECTRON_DIR, "path.txt"), "electron.exe");

    // 清理 zip
    fs.unlinkSync(ZIP_PATH);

    // 验证
    const exePath = path.join(DIST_DIR, "electron.exe");
    if (fs.existsSync(exePath)) {
      const stat = fs.statSync(exePath);
      console.log(`[done] electron.exe 就绪 (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
    } else {
      console.error("[error] electron.exe 未找到！");
      process.exit(1);
    }
  } catch (err) {
    console.error("[error]", err.message);
    process.exit(1);
  }
})();
