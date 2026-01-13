# Changelog

## v0.2.1

### Bug Fixes

- Use `git ls-remote` for remote branch detection instead of `git rev-parse`
  - Improves reliability in CI environments where local refs may be stale
  - Gracefully handles network errors by creating orphan branch

## v0.2.0

### Features

- Add `reportPath` option for custom report URL configuration
  - If starts with `http`, used as full URL
  - Otherwise, used as path segment in the generated URL

## v0.1.0

Initial release of reg-publish-gh-pages-plugin.

### Features

- Add `GhPagesPublisherPlugin` for deploying VRT reports to GitHub Pages
- Add `GhPagesPreparerPlugin` for interactive configuration via `reg-suit init`
- Support dynamic URL generation based on repository information
- Support deployment via git worktree for efficient branch management
- Support environment variable expansion in options (`$VAR` syntax)
- Auto-detect repository info from `GITHUB_REPOSITORY` env or git remote
- Use `GITHUB_ACTOR` for commit author attribution
- Add push retry with rebase on conflict

### Configuration Options

- `branch` - Target branch for deployment (optional, enables deployment when set)
- `outDir` - Output directory on the target branch
- `sourceDir` - Source directory to deploy (defaults to working directory)
- `commitMessage` - Custom commit message
- `includeCommitHash` - Include commit hash in output path

### Documentation

- Add comprehensive README with configuration examples
- Add Japanese documentation (README.ja.md)
- Add example project with Playwright screenshot workflow
