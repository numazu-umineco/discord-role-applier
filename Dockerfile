# マルチステージビルド：ビルドステージ
FROM node:24-alpine AS builder

WORKDIR /app

# 依存関係のインストール
COPY package*.json ./
RUN npm ci

# ソースコードのコピーとビルド
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# 本番環境用イメージ
FROM node:24-alpine

WORKDIR /app

# 本番用依存関係のみインストール
COPY package*.json ./
RUN npm ci --only=production

# ビルド成果物をコピー
COPY --from=builder /app/dist ./dist

# 非rootユーザーで実行
USER node

# HTTPサーバーのポートを公開
EXPOSE 8080

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["node", "dist/index.js"]
