# Example

A sample project to demonstrate reg-publish-gh-pages-plugin.

## Directory Structure

- `src/index.html` - Target page for screenshots
- `__screenshots__/` - Current screenshots (actualDir)
- `expected/` - Baseline screenshots for comparison

## Updating Screenshots

Takes a screenshot of `src/index.html` using Playwright and saves it to `__screenshots__/`.

```bash
pnpm setup:playwright  # first time only
pnpm screenshot
```

## CI Workflows

### VRT (Pull Request)

`.github/workflows/vrt.yml` - Runs VRT on each PR

1. Restores base branch snapshots from cache
2. Runs `reg-suit run` for comparison
3. Deploys results to `gh-pages` branch at `pr/{PR number}/{commit-hash}/`

The output path is configured via `VRT_OUTPUT_DIR` environment variable in regconfig.json.

### Save VRT Cache (Push to main)

`.github/workflows/save-vrt-cache.yml` - Caches snapshots on push to main

Saves `expected/` to cache for use as baseline in PR comparisons.
