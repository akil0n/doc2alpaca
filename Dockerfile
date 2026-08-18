# ============================================================
# Doc2Alpaca 多阶段构建
#   阶段 1 deps    : 安装依赖（充分利用 npm 缓存层）
#   阶段 2 builder : 生成 Prisma Client + 构建 Next.js standalone
#   阶段 3 runner  : 精简运行镜像（web 用 standalone，worker 用 tsx）
#
# 关键点（面试/学习重点）：
#   - 多阶段构建：最终镜像不含源码构建期产物，体积更小
#   - output: "standalone"：Next.js 把 server 及其最小依赖打进 .next/standalone
#   - ELECTRON_SKIP_BINARY_DOWNLOAD：Docker 只跑 Web/Worker，不打包桌面端
# ============================================================

# ---------- 阶段 1：依赖 ----------
FROM node:20-alpine AS deps
WORKDIR /app

# 跳过 Electron 二进制下载（桌面端打包才需要）
# 跳过 Prisma 的 postinstall 自动 generate（稍后在 builder 显式执行）
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    PRISMA_SKIP_POSTINSTALL_GENERATE=true \
    NEXT_TELEMETRY_DISABLED=1

# 先只复制依赖清单，这样只有依赖变化时才重新跑 npm ci（层缓存）
COPY package.json package-lock.json ./
RUN npm ci

# ---------- 阶段 2：构建 ----------
FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    # prisma generate 不真正连库，给个占位 URL 即可
    DATABASE_URL="postgresql://user:pass@localhost:5432/doc2alpaca"

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 依据 schema.prisma 生成 Prisma Client
RUN npx prisma generate
# next build 产出 .next/standalone，并执行 scripts/postbuild.js 补齐 static/public
RUN npm run build

# ---------- 阶段 3：运行 ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0

# Prisma 查询引擎在 alpine(musl) 上需要 openssl
RUN apk add --no-cache openssl

# 完整 node_modules：web 由 standalone 自带最小依赖，worker 经 tsx 运行需要全量依赖 + tsx + prisma
COPY --from=builder /app/node_modules ./node_modules

# standalone 产物（server.js + .next/ + public/ 已在 postbuild 阶段补齐）
COPY --from=builder /app/.next/standalone ./

# worker 运行时需要的源码与配置（tsx 依赖 tsconfig 解析 @/ 别名）
COPY --from=builder /app/workers ./workers
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/types ./types
COPY --from=builder /app/auth.ts ./auth.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/package.json ./package.json

# Prisma 迁移文件（供容器启动时执行 migrate deploy）
COPY --from=builder /app/prisma ./prisma

# 应用运行时写 .tmp（上传暂存 / 会话进度），确保非 root 可写
RUN mkdir -p .tmp && chown node:node .tmp

USER node
EXPOSE 3000

# 默认启动 web；worker 服务在 docker-compose 里覆盖 command
CMD ["node", "server.js"]
