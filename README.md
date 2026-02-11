# Discord Role Applier Bot

Discordのチャンネル・スレッドで発言した全員にロールを一括付与できるBot

## 機能

- メッセージ右クリックでコマンド実行
- チャンネル・スレッドのメッセージ履歴から発言者を自動抽出（最大1000件）
  - スレッド内のメッセージで実行 → スレッドの発言者が対象
  - 通常チャンネルのメッセージで実行 → チャンネルの発言者が対象
- Ephemeralメッセージでロール選択（実行者のみに表示）
- 確認画面で誤操作防止
- 特定のロールを持つユーザーのみ実行可能
- Dockerでポータブルに動作

## セットアップ

### 1. Discord Bot作成

1. [Discord Developer Portal](https://discord.com/developers/applications) にアクセス
2. 「New Application」をクリックしてアプリケーションを作成
3. 左メニューから「Bot」を選択
4. 「Add Bot」をクリック
5. Bot Tokenをコピー（後で使います）
6. 「Privileged Gateway Intents」で以下を有効化：
   - SERVER MEMBERS INTENT
   - MESSAGE CONTENT INTENT

### 2. Bot招待

1. 左メニューから「OAuth2」→「URL Generator」を選択
2. SCOPESで以下を選択：
   - `bot`
   - `applications.commands`
3. BOT PERMISSIONSで以下を選択：
   - `Manage Roles`
   - `Read Messages/View Channels`
   - `Read Message History`
4. 生成されたURLをブラウザで開いてBotを招待

### 3. ロール設定

Discord サーバー設定で、Botのロールを**付与したいロールより上**に配置してください。

Discordのロール階層システムでは、上位のロールのみ下位のロールを管理できます。

### 4. 環境変数設定

`.env.example`をコピーして`.env`を作成し、以下を設定：

```bash
cp .env.example .env
```

```env
# Discord Bot設定
DISCORD_TOKEN=your_bot_token_here          # Bot Token
CLIENT_ID=your_application_id_here         # Application ID

# サーバー設定
GUILD_ID=your_guild_id_here                # サーバーID（開発用）

# 権限設定（カンマ区切りで複数指定可能、空欄で全員に許可）
REQUIRED_ROLE_IDS=

# メッセージ履歴取得設定
MAX_MESSAGE_FETCH=1000

# ロギング設定
LOG_LEVEL=info

# Node環境
NODE_ENV=production
```

### 5. コマンド登録

Botを起動する前に、Message Commandを登録します：

```bash
npm install
npm run deploy:commands
```

## 起動方法

### ローカル（開発用）

```bash
npm run dev
```

### Docker（本番用）

```bash
docker-compose up -d
```

停止：
```bash
docker-compose down
```

ログ確認：
```bash
docker-compose logs -f
```

## 使い方

### 基本的な使い方

1. Discordでチャンネルまたはスレッド内の任意のメッセージを右クリック
2. 「アプリ」→「発言者にロールを適用する」を選択
3. メッセージ履歴が取得される（数秒）
4. ロール選択メニューが表示される
5. 付与したいロールを選択
6. 確認画面で「実行」ボタンをクリック
7. ロールが一括付与される

### スレッドでの使用

- スレッド内のメッセージで実行すると、**そのスレッドの発言者全員**にロールが付与されます
- 通常チャンネルのメッセージで実行すると、**そのチャンネルの発言者全員**にロールが付与されます
- 操作画面（ephemeralメッセージ）は実行者のみに表示されます

## トラブルシューティング

### 「付与可能なロールがありません」と表示される

Botのロールがサーバーの他のロールより下にある可能性があります。

サーバー設定 → ロール から、Botのロールを**付与したいロールより上**にドラッグして移動してください。

### 「Botに必要な権限がありません」と表示される

1. Discord Developer Portalで「Privileged Gateway Intents」を有効にしてください
2. Botに「Manage Roles」権限を付与してください

### コマンドが表示されない

1. コマンド登録を実行してください： `npm run deploy:commands`
2. Discordを再起動してください
3. ギルドコマンドの場合、`.env`の`GUILD_ID`が正しいか確認してください

## 開発

### ビルド

```bash
npm run build
```

### フォーマット

```bash
npm run format
```

### Lint

```bash
npm run lint
```

## 技術スタック

- **言語**: TypeScript
- **ライブラリ**: discord.js v14
- **ロギング**: stdout/stderr (Dockerログ管理推奨)
- **インフラ**: Docker / docker-compose

## ライセンス

MIT License
