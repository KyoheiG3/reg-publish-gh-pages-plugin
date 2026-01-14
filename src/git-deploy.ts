import { DefaultArtifactClient } from '@actions/artifact'
import { getIDToken } from '@actions/core'
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, rmSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import * as tar from 'tar'
import type { RepoInfo } from './git-util'

export interface DeployOptions {
  branch: string
  sourceDir: string
  targetDir: string
  commitMessage: string
  artifactDeploy?: boolean
  repoInfo?: RepoInfo
}

// Same as actions-gh-pages: use GITHUB_ACTOR if available, otherwise fall back to github-actions[bot]
const actor = process.env.GITHUB_ACTOR
const GIT_USER_NAME = actor ?? 'github-actions[bot]'
const GIT_USER_EMAIL = actor
  ? `${actor}@users.noreply.github.com`
  : 'github-actions[bot]@users.noreply.github.com'

const ARTIFACT_NAME = 'github-pages'
const TAR_FILE = 'artifact.tar'

function exec(command: string, cwd?: string): string {
  return execSync(command, { encoding: 'utf-8', cwd }).trim()
}

function escapeDoubleQuotes(str: string): string {
  return str.replace(/"/g, '\\"')
}

function branchExists(branch: string): boolean {
  try {
    // Check if branch exists on remote without fetching
    const result = exec(`git ls-remote --heads origin ${branch}`)
    return result.length > 0
  } catch {
    return false
  }
}

export function isGitHubActions(): boolean {
  return !!process.env.GITHUB_ACTIONS
}

async function deployPagesViaArtifact(
  worktreeDir: string,
  repoInfo: RepoInfo,
): Promise<void> {
  const tempDir = process.env.RUNNER_TEMP ?? '/tmp'
  const tarPath = join(tempDir, TAR_FILE)

  try {
    // Create tar archive (non-gzipped, as required by deploy-pages)
    await tar.create(
      {
        file: tarPath,
        cwd: worktreeDir,
        filter: (path) => !path.startsWith('.git/') && path !== '.git',
      },
      ['.'],
    )

    // Upload artifact
    const client = new DefaultArtifactClient()
    const { id: artifactId } = await client.uploadArtifact(
      ARTIFACT_NAME,
      [tarPath],
      tempDir,
      { compressionLevel: 0 },
    )

    if (!artifactId) {
      throw new Error('Failed to upload artifact')
    }

    // Get OIDC token for Pages deployment
    const oidcToken = await getIDToken()

    // Create Pages deployment via GitHub API
    const response = await fetch(
      `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/pages/deployments`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          artifact_id: artifactId,
          pages_build_version: process.env.GITHUB_SHA ?? 'unknown',
          oidc_token: oidcToken,
        }),
      },
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to create Pages deployment: ${error}`)
    }
  } finally {
    if (existsSync(tarPath)) {
      unlinkSync(tarPath)
    }
  }
}

export async function deployToGitHubPages(options: DeployOptions): Promise<void> {
  const {
    branch,
    sourceDir,
    targetDir,
    commitMessage,
    artifactDeploy,
    repoInfo,
  } = options

  if (!targetDir) {
    throw new Error('targetDir is required')
  }

  if (artifactDeploy && !isGitHubActions()) {
    throw new Error('artifactDeploy is only available in GitHub Actions')
  }

  if (artifactDeploy && !repoInfo) {
    throw new Error('repoInfo is required for artifactDeploy')
  }

  const worktreeDir = '.gh-pages-worktree'
  const destDir = join(worktreeDir, targetDir)
  let fileMoved = false

  try {
    // Clean up existing worktree if exists
    if (existsSync(worktreeDir)) {
      exec(`git worktree remove --force ${worktreeDir}`)
    }

    if (branchExists(branch)) {
      // Fetch the branch to ensure we have the latest refs
      exec(`git fetch origin ${branch}`)
      // Add worktree for existing branch
      exec(`git worktree add ${worktreeDir} origin/${branch}`)
      exec(`git checkout -B ${branch}`, worktreeDir)
    } else {
      // Create orphan branch using worktree
      exec(`git worktree add --detach ${worktreeDir}`)
      exec(`git checkout --orphan ${branch}`, worktreeDir)
      // Remove all files from worktree (keep only .git)
      exec('git rm -rf .', worktreeDir)
    }

    // Configure git user (same as actions-gh-pages)
    exec(
      `git config user.name "${escapeDoubleQuotes(GIT_USER_NAME)}"`,
      worktreeDir,
    )
    exec(
      `git config user.email "${escapeDoubleQuotes(GIT_USER_EMAIL)}"`,
      worktreeDir,
    )

    // Ensure parent directory exists
    const parentDir = dirname(destDir)
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true })
    }

    // Remove existing target directory if exists
    if (existsSync(destDir)) {
      rmSync(destDir, { recursive: true, force: true })
    }

    // Move source to target
    renameSync(sourceDir, destDir)
    fileMoved = true

    // Stage all changes
    exec('git add -A', worktreeDir)

    // Check if there are changes to commit
    try {
      exec('git diff --cached --quiet', worktreeDir)
      // No changes, restore files and skip commit
      renameSync(destDir, sourceDir)
      fileMoved = false
      return
    } catch {
      // Has changes, continue
    }

    // Commit and push
    exec(`git commit -m "${escapeDoubleQuotes(commitMessage)}"`, worktreeDir)
    try {
      exec(`git push origin ${branch}`, worktreeDir)
    } catch {
      // If push fails (e.g., remote has new commits), pull and retry
      exec(`git pull --rebase origin ${branch}`, worktreeDir)
      exec(`git push origin ${branch}`, worktreeDir)
    }

    // Deploy via artifact if enabled
    if (artifactDeploy && repoInfo) {
      await deployPagesViaArtifact(worktreeDir, repoInfo)
    }

    // Move files back to original location
    renameSync(destDir, sourceDir)
    fileMoved = false
  } finally {
    // Restore files if they were moved but not restored
    if (fileMoved && existsSync(destDir)) {
      renameSync(destDir, sourceDir)
    }

    // Cleanup worktree
    if (existsSync(worktreeDir)) {
      exec(`git worktree remove --force ${worktreeDir}`)
    }
  }
}
