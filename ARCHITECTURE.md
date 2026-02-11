# アーキテクチャ設計書

## 1. システム概要

### 1.1 アーキテクチャスタイル

**レイヤードアーキテクチャ**を採用し、責務を明確に分離：
- **Presentation Layer**: Discord Interaction処理
- **Service Layer**: ビジネスロジック
- **Infrastructure Layer**: Discord API通信、ロギング

**ステートレス設計**により、水平スケーリングに対応。

---

## 2. システム構成

### 2.1 ハイレベルアーキテクチャ

```
┌─────────────────────────────────────────┐
│          Discord Platform               │
│  (Message Context Menu Commands)        │
└──────────────┬──────────────────────────┘
               │ Interaction Events
               ▼
┌─────────────────────────────────────────┐
│        Discord Bot Application          │
│                                         │
│  ┌────────────────────────────────┐   │
│  │   Event Handler (index.ts)     │   │
│  └─────────┬──────────────────────┘   │
│            │                            │
│  ┌─────────▼──────────────────────┐   │
│  │  Commands Layer                │   │
│  │  - applyRole.ts                │   │
│  └─────────┬──────────────────────┘   │
│            │                            │
│  ┌─────────▼──────────────────────┐   │
│  │  Interactions Layer            │   │
│  │  - roleSelectMenu.ts           │   │
│  │  - interactionHandler.ts       │   │
│  └─────────┬──────────────────────┘   │
│            │                            │
│  ┌─────────▼──────────────────────┐   │
│  │  Services Layer                │   │
│  │  - permissionService.ts        │   │
│  │  - messageHistoryService.ts    │   │
│  │  - roleService.ts              │   │
│  └─────────┬──────────────────────┘   │
│            │                            │
│  ┌─────────▼──────────────────────┐   │
│  │  Utils Layer                   │   │
│  │  - logger.ts                   │   │
│  │  - errorHandler.ts             │   │
│  └────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

---

## 3. ディレクトリ構造

```
discord-role-applier/
├── src/
│   ├── index.ts                       # エントリーポイント
│   ├── bot.ts                         # Discord Client初期化
│   ├── config/
│   │   └── env.ts                     # 環境変数管理
│   ├── commands/
│   │   └── applyRole.ts               # Message Commandハンドラ
│   ├── services/
│   │   ├── messageHistoryService.ts   # メッセージ履歴取得
│   │   ├── roleService.ts             # ロール付与処理
│   │   └── permissionService.ts       # 権限チェック
│   ├── interactions/
│   │   ├── roleSelectMenu.ts          # ロール選択メニュー生成
│   │   └── interactionHandler.ts      # ボタン・メニュー処理
│   ├── utils/
│   │   ├── logger.ts                  # ロギング
│   │   └── errorHandler.ts            # エラーハンドリング
│   └── types/
│       └── index.ts                   # 型定義
├── scripts/
│   └── deploy-commands.ts             # コマンド登録スクリプト
└── ...
```

---

## 4. モジュール設計

### 4.1 Commands Layer

#### applyRole.ts

**責務**: Message Context Menu Commandの処理

**主要機能**:
- コマンド実行時の初期応答
- 権限チェック
- メッセージ履歴取得のオーケストレーション
- ロール選択UIの表示

**依存関係**:
- `PermissionService`: 権限チェック
- `MessageHistoryService`: メッセージ取得
- `RoleService`: ロール一覧取得
- `RoleSelectMenu`: UI生成

**処理フロー**:
```
1. インタラクション受信
2. メンバー情報検証
3. 権限チェック
4. メッセージ履歴取得（⏳表示）
5. ユーザー抽出
6. ロール選択UI表示
```

---

### 4.2 Interactions Layer

#### roleSelectMenu.ts

**責務**: ロール選択UIの生成

**主要機能**:
- `createRoleSelectMenu()`: StringSelectMenuの生成
- `extractChannelIdFromCustomId()`: カスタムIDからチャンネルID抽出

**設計ポイント**:
- カスタムID形式: `role_select_{channelId}`
- 最大25個のロール表示（Discord制限）
- ロールはポジション降順でソート

#### interactionHandler.ts

**責務**: ロール選択後・ボタン押下後の処理

**主要機能**:
- `handleRoleSelection()`: ロール選択→確認画面表示
- `handleRoleConfirm()`: 実行ボタン→ロール付与
- `handleRoleCancel()`: キャンセルボタン→中止

**設計ポイント**:
- メッセージ更新方式（`interaction.update()`）でUI一貫性
- 確認画面でダブルチェック
- ローディング状態の適切な管理

---

### 4.3 Services Layer

#### permissionService.ts

**責務**: 権限管理

**主要API**:
```typescript
class PermissionService {
  // 必須ロールを持つか
  static hasRequiredRole(member: GuildMember): boolean

  // ロール階層を考慮した管理権限チェック
  static canManageRole(member: GuildMember, targetRole: Role): boolean

  // Botがロールを付与できるか
  static canBotManageRole(botMember: GuildMember, targetRole: Role): boolean
}
```

**権限チェックロジック**:
1. サーバーオーナーは常に許可
2. 環境変数で指定されたロールを持つか（空の場合は拒否）
3. `MANAGE_ROLES`権限を持つか
4. 自分/Botの最上位ロールより下位のロールのみ管理可能

#### messageHistoryService.ts

**責務**: メッセージ履歴取得とユーザー抽出

**主要API**:
```typescript
class MessageHistoryService {
  // チャンネルのメッセージ履歴を取得（バッチ処理）
  static async fetchChannelMessages(
    channel: Channel,
    limit?: number
  ): Promise<Message[]>

  // ユニークユーザーを抽出（Bot、システムメッセージ除外）
  static extractUniqueUsers(messages: Message[]): Set<string>

  // サーバーに在籍中のメンバーのみフィルタリング
  static async filterValidMembers(
    userIds: Set<string>,
    guild: Guild
  ): Promise<GuildMember[]>
}
```

**最適化ポイント**:
- 100件ずつバッチ取得（Discord API制限）
- レート制限回避のため100ms間隔
- ボット、システムメッセージ、退出済みユーザーの除外

#### roleService.ts

**責務**: ロール管理

**主要API**:
```typescript
class RoleService {
  // 付与可能なロール一覧を取得
  static getAssignableRoles(
    guild: Guild,
    botMember: GuildMember
  ): Role[]

  // 複数メンバーにロールを一括付与
  static async applyRoleToMembers(
    members: GuildMember[],
    roleId: string
  ): Promise<RoleApplicationResult>
}
```

**ロール付与ロジック**:
- 既にロールを持つユーザーはスキップ
- 各ユーザー間で100ms待機（レート制限対策）
- 成功/失敗/スキップを集計

**フィルタリングロジック**:
- `@everyone`ロールを除外
- managed（Bot統合ロール）を除外
- Botのロール階層より上位のロールを除外（安全性のため）

---

### 4.4 Utils Layer

#### logger.ts

**責務**: 構造化ロギング（stdout/stderr出力）

**ログレベル**:
- `debug`: 詳細なデバッグ情報
- `info`: 通常の情報
- `warn`: 警告
- `error`: エラー（スタックトレース含む）

**出力先**:
- すべてのログは標準出力（stdout/stderr）に出力
- Docker環境で `docker logs` / `docker-compose logs` で確認可能
- 外部ログ管理システム（CloudWatch, Datadog等）との統合が容易

#### errorHandler.ts

**責務**: エラーハンドリングの統一

**エラー種別**:
```typescript
enum ErrorType {
  PERMISSION_DENIED,
  RATE_LIMIT,
  DISCORD_API_ERROR,
  INVALID_CHANNEL,
  INVALID_ROLE,
  MEMBER_NOT_FOUND,
  UNKNOWN
}
```

**エラー処理フロー**:
1. エラーをログに記録
2. ユーザーフレンドリーなメッセージに変換
3. Ephemeralメッセージで通知

---

## 5. データフロー

### 5.1 通常フロー

```
User Action: メッセージ右クリック→コマンド選択
     ↓
[index.ts] InteractionCreate イベント検知
     ↓
[applyRole.ts] handleApplyRoleCommand()
     ├─ [permissionService] 権限チェック
     ├─ [messageHistoryService] メッセージ履歴取得
     ├─ [messageHistoryService] ユーザー抽出
     ├─ [roleService] ロール一覧取得
     └─ [roleSelectMenu] UI生成
     ↓
User Action: ロール選択
     ↓
[index.ts] StringSelectMenu検知
     ↓
[interactionHandler] handleRoleSelection()
     ├─ [permissionService] 権限再チェック
     └─ 確認画面表示（ボタン付き）
     ↓
User Action: 実行ボタンクリック
     ↓
[index.ts] Button検知
     ↓
[interactionHandler] handleRoleConfirm()
     ├─ [messageHistoryService] メッセージ再取得
     ├─ [messageHistoryService] ユーザー抽出
     └─ [roleService] ロール一括付与
     ↓
結果表示（成功/失敗/スキップ件数）
```

---

## 6. 状態管理

### 6.1 ステートレス設計

Botはステートレスに設計されており、以下の情報のみをインタラクション間で保持：
- カスタムID内にエンコードされた情報（チャンネルID、ロールID）

**メリット**:
- 水平スケーリング可能
- インスタンス再起動時の影響なし
- メモリ使用量の削減

### 6.2 情報の受け渡し

**カスタムID形式**:
- ロール選択メニュー: `role_select_{channelId}`
- 確認ボタン: `role_confirm_{channelId}_{roleId}`
- キャンセルボタン: `role_cancel_{channelId}_{roleId}`

**メリット**:
- インタラクション間でコンテキストを保持
- データベース不要
- シンプルな実装

---

## 7. エラーハンドリング戦略

### 7.1 エラー分類

| カテゴリ | 対応 | ユーザー通知 |
|---------|------|------------|
| 権限エラー | 処理中止 | ✅ |
| Discord API エラー | リトライ（レート制限の場合） | ✅ |
| ネットワークエラー | 処理中止 | ✅ |
| 不正な入力 | 処理中止 | ✅ |
| 予期しないエラー | ログ記録・処理中止 | ✅（汎用メッセージ） |

### 7.2 グレースフルデグラデーション

**部分的な失敗の許容**:
- ロール付与で一部ユーザーに失敗しても他のユーザーへの処理は継続
- 失敗したユーザー情報をログに記録
- 最終結果で失敗件数を報告

---

## 8. セキュリティ設計

### 8.1 認証・認可

**3層の権限チェック**:
1. コマンド実行権限（環境変数ベース）
2. Discord標準権限（`MANAGE_ROLES`）
3. ロール階層チェック

### 8.2 データ保護

- Bot Token: 環境変数管理（`.env`）
- ログ: センシティブ情報を含めない
- Ephemeralメッセージ: 実行者のみに表示

### 8.3 実行環境

- 非rootユーザーでコンテナ実行
- 最小権限の原則

---

## 9. パフォーマンス最適化

### 9.1 Discord API制限対策

**レート制限**:
- メッセージ取得: 100ms間隔
- ロール付与: 100ms間隔
- バッチサイズ: 100件

**タイムアウト対策**:
- Interactionの15分制限を考慮
- 大量データ処理時のローディング表示

### 9.2 メモリ最適化

- ストリーミング処理（大量メッセージの分割取得）
- 不要なデータの即座破棄

---

## 10. Docker構成

### 10.1 マルチステージビルド

```dockerfile
# Stage 1: ビルド
FROM node:20-alpine AS builder
- TypeScriptコンパイル
- 開発依存関係のインストール

# Stage 2: 本番実行
FROM node:20-alpine
- 本番依存関係のみ
- 非rootユーザーで実行
- ヘルスチェック機能
```

**メリット**:
- 最終イメージサイズの削減
- セキュリティの向上
- ビルド時間の短縮（レイヤーキャッシュ）

### 10.2 docker-compose構成

```yaml
services:
  bot:
    - 環境変数をファイルから読み込み
    - 自動再起動
```

---

## 11. 拡張性

### 11.1 水平スケーリング

- ステートレス設計により複数インスタンス起動可能
- インスタンス間の調整不要

### 11.2 機能拡張ポイント

**追加しやすい機能**:
- 新しいコマンドの追加（`commands/`に追加）
- 新しいサービスの追加（`services/`に追加）
- カスタムインタラクション（`interactions/`に追加）

**アーキテクチャ上の準備**:
- レイヤー分離による変更の局所化
- 依存性注入パターン（静的メソッドによる疎結合）
- エラーハンドリングの統一

---

## 12. 技術スタック

| レイヤー | 技術 | 用途 |
|---------|------|------|
| 言語 | TypeScript 5.x | 型安全性 |
| ランタイム | Node.js 20 | 実行環境 |
| Discord SDK | discord.js v14 | Discord API通信 |
| ロギング | console (stdout/stderr) | ログ出力 |
| コンテナ | Docker | ポータブル実行 |
| オーケストレーション | docker-compose | 簡易デプロイ |

---

## 13. 運用設計

### 13.1 ログ管理

**ログ出力先**:
- すべての環境: 標準出力（stdout/stderr）

**Docker環境でのログ確認**:
```bash
# リアルタイムでログを確認
docker-compose logs -f bot

# 直近100行を表示
docker-compose logs --tail=100 bot
```

**ログ管理の推奨**:
- Docker のログドライバー（json-file, syslog, journald等）を利用
- 外部ログ管理サービス（CloudWatch Logs, Datadog, Splunk等）への転送
- ログローテーションはDockerのログドライバー設定で管理

### 13.2 モニタリング

**ヘルスチェック**:
- Dockerヘルスチェック機能
- 30秒間隔でヘルスチェック実行

**推奨メトリクス**:
- Bot稼働時間
- コマンド実行回数
- エラー発生率
- API応答時間

---

## 14. 今後の改善案

### 14.1 短期的改善

- ユニットテスト追加
- E2Eテストの自動化
- CI/CD パイプライン構築

### 14.2 長期的改善

- データベース導入（実行履歴記録）
- Webダッシュボード
- 複数ロール同時付与
- スケジュール実行機能
