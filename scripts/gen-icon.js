/**
 * 生成应用图标 PNG（512x512）
 * 使用内置 zlib，无第三方依赖
 * 设计：Apple 系统蓝渐变背景 + 白色文档/对话图标
 */
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

const W = 512,
  H = 512;
const rgb = Buffer.alloc(W * H * 3);

// 圆角矩形遮罩（应用图标标准形状）
function inRoundedRect(x, y, rx, ry, rw, rh, r) {
  if (x < rx || x >= rx + rw || y < ry || y >= ry + rh) return false;
  const cx = Math.min(x - rx, rx + rw - 1 - x);
  const cy = Math.min(y - ry, ry + rh - 1 - y);
  if (cx >= r || cy >= r) return true;
  const dx = r - cx,
    dy = r - cy;
  return dx * dx + dy * dy <= r * r;
}

// 绘制：蓝色渐变圆角背景 + 白色文档+箭头图形
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    const inIcon = inRoundedRect(x, y, 16, 16, W - 32, H - 32, 112);
    if (!inIcon) {
      // 透明（填 0，PNG RGB 模式无 alpha，填浅灰）
      rgb[i] = 240;
      rgb[i + 1] = 240;
      rgb[i + 2] = 244;
      continue;
    }
    // 蓝色渐变：左上 #0A84FF → 右下 #0046A8
    const t = (x + y) / (W + H);
    const r = Math.round(0x0a + (0x00 - 0x0a) * t);
    const g = Math.round(0x84 + (0x46 - 0x84) * t);
    const b = Math.round(0xff + (0xa8 - 0xff) * t);
    rgb[i] = r;
    rgb[i + 1] = g;
    rgb[i + 2] = b;
  }
}

// 白色文档形状（居中偏上）+ 横线（代表文本）
const docX = 136,
  docY = 120,
  docW = 240,
  docH = 280,
  docR = 28;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (!inRoundedRect(x, y, docX, docY, docW, docH, docR)) continue;
    const i = (y * W + x) * 3;
    rgb[i] = 255;
    rgb[i + 1] = 255;
    rgb[i + 2] = 255;
  }
}

// 文档上的横线（蓝色，代表文本行）
const lineColor = [0x0a, 0x84, 0xff];
const lines = [
  { y: 180, x0: 172, x1: 340 },
  { y: 214, x0: 172, x1: 320 },
  { y: 248, x0: 172, x1: 336 },
  { y: 282, x0: 172, x1: 300 },
  { y: 316, x0: 172, x1: 328 },
  { y: 350, x0: 172, x1: 312 },
];
for (const ln of lines) {
  for (let x = ln.x0; x < ln.x1; x++) {
    for (let dy = 0; dy < 8; dy++) {
      const yy = ln.y + dy;
      if (yy >= H) continue;
      const i = (yy * W + x) * 3;
      rgb[i] = lineColor[0];
      rgb[i + 1] = lineColor[1];
      rgb[i + 2] = lineColor[2];
    }
  }
}

// === PNG 编码 ===
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // color type: RGB
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

// 扫描行：每行前加 filter 字节 0
const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0;
  rgb.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
}
const idat = zlib.deflateSync(raw, { level: 9 });

const png = Buffer.concat([
  sig,
  chunk("IHDR", ihdr),
  chunk("IDAT", idat),
  chunk("IEND", Buffer.alloc(0)),
]);

const outDir = path.resolve(__dirname, "..", "build");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "icon.png");
fs.writeFileSync(outPath, png);
console.log(`[gen-icon] 已生成 ${outPath} (${png.length} bytes, ${W}x${H})`);
