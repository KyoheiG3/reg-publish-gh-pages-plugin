# reg-publish-gh-pages-plugin

[English](./README.md) | **日本語**

ビジュアルリグレッションテストのレポートを GitHub Pages にデプロイする [reg-suit](https://github.com/reg-viz/reg-suit) プラグインです。

## 特徴

- **GitHub Pages への直接デプロイ** - `git worktree` を使用した効率的なブランチ管理
- **リポジトリ自動検出** - `GITHUB_REPOSITORY` 環境変数または git remote から自動取得
- **柔軟な出力パス** - カスタム出力ディレクトリやコミットハッシュベースのパスをサポート
- **GitHub Actions 連携** - `GITHUB_ACTOR` をコミット作成者として使用
- **reportUrl のみモード** - デプロイせずにレポート URL のみ生成（他のデプロイツールとの併用に便利）
- **プッシュ時の自動リトライ** - 競合発生時に rebase して再プッシュ

## インストール

```bash
npm install reg-publish-gh-pages-plugin
# or
pnpm add reg-publish-gh-pages-plugin
# or
yarn add reg-publish-gh-pages-plugin
```

## 設定

`regconfig.json` にプラグインを追加します：

```json
{
  "plugins": {
    "reg-publish-gh-pages-plugin": {
      "branch": "gh-pages",
      "outDir": "vrt-reports"
    }
  }
}
```

### オプション

| オプション | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| `branch` | `string` | No | - | デプロイ先ブランチ名。未設定の場合、デプロイせず `reportUrl` のみ生成。 |
| `outDir` | `string` | No | `""` | ターゲットブランチ上の出力ディレクトリ。 |
| `sourceDir` | `string` | No | `workingDir` | デプロイ元ディレクトリ。デフォルトは reg-suit の作業ディレクトリ。 |
| `commitMessage` | `string` | No | `"deploy: <key>"` | カスタムコミットメッセージ。デフォルトは比較キーを含む。 |
| `includeCommitHash` | `boolean` | No | `false` | 出力パスにコミットハッシュを含める（例：`outDir/abc123/`）。 |
| `reportPath` | `string` | No | - | カスタムレポート URL またはパス。`http` で始まる場合は完全な URL として使用。それ以外は生成される URL のパス部分として使用。 |

### 設定例

#### 基本的なデプロイ

```json
{
  "plugins": {
    "reg-publish-gh-pages-plugin": {
      "branch": "gh-pages",
      "outDir": "reports"
    }
  }
}
```

レポート URL: `https://{owner}.github.io/{repo}/reports/`

#### コミットハッシュをパスに含める

```json
{
  "plugins": {
    "reg-publish-gh-pages-plugin": {
      "branch": "gh-pages",
      "outDir": "pr/vrt",
      "includeCommitHash": true
    }
  }
}
```

レポート URL: `https://{owner}.github.io/{repo}/pr/vrt/{commit-hash}/`

#### 環境変数を使用する

オプションは `$VAR` 構文で環境変数の展開をサポートしています。CI での動的な設定が可能です。

```json
{
  "plugins": {
    "reg-publish-gh-pages-plugin": {
      "branch": "gh-pages",
      "outDir": "$VRT_OUTPUT_DIR"
    }
  }
}
```

```yaml
# GitHub Actions での設定
- name: Run reg-suit
  run: npx reg-suit run
  env:
    VRT_OUTPUT_DIR: pr/${{ github.event.pull_request.number }}/vrt
```

レポート URL: `https://{owner}.github.io/{repo}/pr/123/vrt/`

#### カスタムレポート URL

`reportPath` で生成されるレポート URL を上書きできます。完全な URL またはパスのみでも指定可能です。

```json
{
  "plugins": {
    "reg-publish-gh-pages-plugin": {
      "branch": "gh-pages",
      "outDir": "reports",
      "reportPath": "https://custom-domain.com/vrt"
    }
  }
}
```

レポート URL: `https://custom-domain.com/vrt/`

#### reportUrl のみ（デプロイなし）

```json
{
  "plugins": {
    "reg-publish-gh-pages-plugin": {
      "outDir": "reports"
    }
  }
}
```

`branch` を設定しない場合、デプロイせず `reportUrl` のみ生成します。他のデプロイツール（例：[actions-gh-pages](https://github.com/peaceiris/actions-gh-pages)）と併用する場合に便利です。

## GitHub Actions での使用

```yaml
name: Visual Regression Test

on: pull_request

permissions:
  contents: write

jobs:
  vrt:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run reg-suit
        run: npx reg-suit run
```

### 必要な権限

- `contents: write` - gh-pages ブランチへのプッシュに必要

## 動作の仕組み

1. **リポジトリ検出** - `GITHUB_REPOSITORY` 環境変数または git remote URL から owner/repo を取得
2. **Worktree 管理** - ターゲットブランチ用の一時的な git worktree を作成
3. **ブランチ処理** - ターゲットブランチが存在しない場合は orphan ブランチを作成
4. **ファイルデプロイ** - レポートファイルを worktree に移動し、コミット・プッシュ
5. **競合解決** - プッシュ失敗時は `git pull --rebase` して再試行
6. **クリーンアップ** - 元のファイルを復元し、worktree を削除

## 環境変数

| 変数 | 説明 |
|-----|------|
| `GITHUB_REPOSITORY` | `owner/repo` 形式のリポジトリ。GitHub Actions では自動設定。 |
| `GITHUB_ACTOR` | git コミット作成者として使用。デフォルトは `github-actions[bot]`。 |

## 開発

```bash
# 依存関係のインストール
pnpm install

# テスト実行
pnpm test

# カバレッジ付きテスト
pnpm test:coverage

# ビルド
pnpm build

# Lint
pnpm lint

# フォーマット
pnpm format
```

## ライセンス

[MIT](./LICENSE)
