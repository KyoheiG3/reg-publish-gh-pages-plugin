# reg-publish-gh-pages-plugin

**English** | [日本語](./README.ja.md)

A [reg-suit](https://github.com/reg-viz/reg-suit) publisher plugin that deploys visual regression test reports to GitHub Pages.

## Features

- **Direct deployment to GitHub Pages** - Uses `git worktree` for efficient branch management
- **Automatic repository detection** - Detects repository info from `GITHUB_REPOSITORY` env or git remote
- **Flexible output paths** - Supports custom output directories and commit hash-based paths
- **GitHub Actions integration** - Uses `GITHUB_ACTOR` for commit author attribution
- **reportUrl only mode** - Can generate report URLs without deploying (useful with other deployment tools)
- **Push retry with rebase** - Automatically handles concurrent push conflicts

## Installation

```bash
npm install reg-publish-gh-pages-plugin
# or
pnpm add reg-publish-gh-pages-plugin
# or
yarn add reg-publish-gh-pages-plugin
```

## Configuration

Add the plugin to your `regconfig.json`:

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

### Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `branch` | `string` | No | - | Branch name to deploy. If not set, only `reportUrl` is generated without deployment. |
| `outDir` | `string` | No | `""` | Output directory on the target branch. |
| `sourceDir` | `string` | No | `workingDir` | Source directory to deploy. Defaults to reg-suit's working directory. |
| `commitMessage` | `string` | No | `"deploy: <key>"` | Custom commit message. Default includes the comparison key. |
| `includeCommitHash` | `boolean` | No | `false` | Include commit hash in the output path (e.g., `outDir/abc123/`). |

### Configuration Examples

#### Basic deployment

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

Report URL: `https://{owner}.github.io/{repo}/reports/`

#### With commit hash in path

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

Report URL: `https://{owner}.github.io/{repo}/pr/vrt/{commit-hash}/`

#### Using environment variables

Options support environment variable expansion with `$VAR` syntax. This allows dynamic configuration in CI.

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
# In GitHub Actions
- name: Run reg-suit
  run: npx reg-suit run
  env:
    VRT_OUTPUT_DIR: pr/${{ github.event.pull_request.number }}/vrt
```

Report URL: `https://{owner}.github.io/{repo}/pr/123/vrt/`

#### reportUrl only (no deployment)

```json
{
  "plugins": {
    "reg-publish-gh-pages-plugin": {
      "outDir": "reports"
    }
  }
}
```

When `branch` is not set, the plugin only generates `reportUrl` without deploying. This is useful when using other deployment tools (e.g., [actions-gh-pages](https://github.com/peaceiris/actions-gh-pages)).

## GitHub Actions Usage

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

### Required Permissions

- `contents: write` - Required for pushing to the gh-pages branch

## How It Works

1. **Repository Detection** - Detects owner/repo from `GITHUB_REPOSITORY` environment variable or git remote URL
2. **Worktree Management** - Creates a temporary git worktree for the target branch
3. **Branch Handling** - Creates an orphan branch if the target branch doesn't exist
4. **File Deployment** - Moves report files to the worktree, commits, and pushes
5. **Conflict Resolution** - If push fails due to concurrent updates, performs `git pull --rebase` and retries
6. **Cleanup** - Restores original files and removes the worktree

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GITHUB_REPOSITORY` | Repository in `owner/repo` format. Auto-detected in GitHub Actions. |
| `GITHUB_ACTOR` | Used for git commit author. Defaults to `github-actions[bot]`. |

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Build
pnpm build

# Lint
pnpm lint

# Format
pnpm format
```

## License

[MIT](./LICENSE)