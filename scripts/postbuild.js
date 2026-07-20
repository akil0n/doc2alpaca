/**
 * next build 后处理：把 static 资源和 public 拷贝到 standalone 目录
 * standalone 输出本身不包含 .next/static 和 public，需要手动补齐
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const standaloneDir = path.join(root, ".next", "standalone");
const staticSrc = path.join(root, ".next", "static");
const staticDst = path.join(standaloneDir, ".next", "static");
const publicSrc = path.join(root, "public");
const publicDst = path.join(standaloneDir, "public");

function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

if (!fs.existsSync(standaloneDir)) {
  console.error("[postbuild] standalone 目录不存在，请先运行 next build");
  process.exit(1);
}

copyDir(staticSrc, staticDst);
console.log("[postbuild] 已复制 .next/static → standalone/.next/static");

if (fs.existsSync(publicSrc)) {
  copyDir(publicSrc, publicDst);
  console.log("[postbuild] 已复制 public → standalone/public");
} else {
  // 即使没有 public 目录也创建一个占位，避免 server 启动报错
  fs.mkdirSync(publicDst, { recursive: true });
  console.log("[postbuild] 创建空 public 占位目录");
}

console.log("[postbuild] 完成");
