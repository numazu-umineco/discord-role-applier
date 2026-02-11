# アーキテクチャ設計

## システム概要

**レイヤードアーキテクチャ**で責務を分離し、**ステートレス設計**で水平スケーリングに対応。

- **Interactions Layer**: Discord Interaction処理
- **Services Layer**: ビジネスロジック
- **Utils Layer**: ロギング・エラーハンドリング

## ディレクトリ構造

```
discord-role-applier/
├── src/
│   ├── index.ts                       # エントリーポイント（Hono HTTPサーバー）
│   ├── config/
│   │   └── env.ts                     # 環境変数管理
│   ├── lib/
│   │   ├── discordClient.ts           # Discord REST APIクライアント
│   │   └── interactionResponse.ts     # HTTPレスポンスヘルパー
│   ├── interactions/
│   │   ├── applyRoleCommand.ts        # Message Commandハンドラ
│   │   ├── roleSelectMenu.ts          # ロール選択メニュー生成
│   │   └── interactionHandler.ts      # ボタン・メニュー処理
│   ├── services/
│   │   ├── messageHistoryService.ts   # メッセージ履歴取得
│   │   ├── roleService.ts             # ロール付与処理
│   │   └── permissionService.ts       # 権限チェック
│   ├── utils/
│   │   ├── logger.ts                  # ロギング
│   │   └── errorHandler.ts            # エラーハンドリング
│   └── types/
│       └── index.ts                   # 型定義
├── scripts/
│   └── deploy-commands.ts             # コマンド登録スクリプト
├── Dockerfile                         # マルチステージビルド
├── docker-compose.yml                 # Docker構成
└── .env                               # 環境変数
```

## 主要コンポーネント

### index.ts
- Hono HTTPサーバーの起動
- Discord Interactions Endpoint（`POST /interactions`）
- Ed25519署名検証
- インタラクションルーティング
- ヘルスチェックエンドポイント（`GET /health`）

### lib/discordClient.ts
- discord.js RESTクラスによるDiscord API通信
- メッセージ取得・メンバー取得・ロール付与などのヘルパー関数

### lib/interactionResponse.ts
- HTTP Interactions Endpoint用のレスポンスヘルパー
- Deferred Response / Update Message / Immediate Response

### applyRoleCommand.ts
- Message Context Menu Commandの処理
- 権限チェック
- チャンネル/スレッド判定
- メッセージ履歴取得
- ロール選択UI表示

### interactionHandler.ts
- ロール選択後の確認画面表示
- 対象者プレビュー（最大30人）
- チャンネル全体の警告表示
- ロール一括付与の実行

### roleSelectMenu.ts
- StringSelectMenuの生成
- カスタムIDの管理（`role_select_{channelId}`）

### Services Layer
- **messageHistoryService**: バッチでメッセージ取得、ユーザー抽出、退出済み除外
- **roleService**: 付与可能ロール一覧、ロール一括付与（スキップ・集計機能）
- **permissionService**: コマンド実行権限、ロール管理権限チェック

### Utils Layer
- **logger**: stdout/stderr出力（Docker対応）
- **errorHandler**: 統一エラーハンドリング、ユーザーフレンドリーな通知

## データフロー

```
User: メッセージ右クリック→コマンド選択
  ↓
Discord → HTTP POST /interactions
  ↓
[index.ts] 署名検証 → ルーティング
  ↓
[applyRoleCommand.ts]
  ├─ Deferred Response返却（即座）
  ├─ 権限チェック（REST API）
  ├─ メッセージ履歴取得（REST API）
  └─ ロール選択UI表示（REST API: editOriginalResponse）
  ↓
User: ロール選択
  ↓
Discord → HTTP POST /interactions
  ↓
[interactionHandler.handleRoleSelection]
  ├─ Deferred Update返却（即座）
  ├─ 対象者プレビュー取得（REST API）
  ├─ 権限再チェック
  └─ 確認画面表示（REST API: editOriginalResponse）
  ↓
User: 「実行」ボタンクリック
  ↓
Discord → HTTP POST /interactions
  ↓
[interactionHandler.handleRoleConfirm]
  ├─ Deferred Update返却（即座）
  ├─ メッセージ再取得（REST API）
  ├─ ロール一括付与（REST API）
  └─ 結果表示（REST API: editOriginalResponse）
```

## ステートレス設計

インタラクション間の情報はカスタムIDにエンコード：
- ロール選択メニュー: `role_select_{channelId}`
- 確認ボタン: `role_confirm_{channelId}_{roleId}`
- キャンセルボタン: `role_cancel_{channelId}_{roleId}`

データベース不要で水平スケーリング可能。

## エラーハンドリング

- 権限エラー → 処理中止、ユーザーに通知
- Discord APIエラー → リトライ（レート制限）、ログ記録
- 予期しないエラー → ログ記録、汎用メッセージで通知
- 部分的な失敗 → 他のユーザーへの処理は継続、失敗件数を報告

## パフォーマンス対策

- メッセージ取得: 100件ずつバッチ、100ms間隔
- ロール付与: 100ms間隔（レート制限対策）
- Interaction応答: 15分制限を考慮

## Docker構成

### マルチステージビルド
- **Stage 1**: TypeScriptコンパイル
- **Stage 2**: 本番依存関係のみ、非rootユーザー実行

### docker-compose
- 環境変数を`.env`から読み込み
- ポート公開（デフォルト: 8080）
- 自動再起動（`restart: unless-stopped`）
- ヘルスチェック（`GET /health`）
- ログは標準出力（`docker logs`で確認可能）

## 技術スタック

| レイヤー | 技術 | 用途 |
|---------|------|------|
| 言語 | TypeScript 5.x | 型安全性 |
| ランタイム | Node.js 24 | 実行環境 |
| HTTPフレームワーク | Hono + @hono/node-server | Interactions Endpoint |
| Discord SDK | discord.js v14（REST API） | Discord API通信 |
| 署名検証 | discord-interactions | Ed25519署名検証 |
| ロギング | console | stdout/stderr出力 |
| コンテナ | Docker | ポータブル実行 |

## 拡張性

- レイヤー分離により変更が局所化
- サービス層の静的メソッドで疎結合
- 新しいコマンド・サービスの追加が容易
- ステートレス設計で水平スケーリング可能
