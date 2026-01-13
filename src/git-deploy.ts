import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface DeployOptions {
  branch: string
  sourceDir: string
  targetDir: string
  commitMessage: string
}

// Same as actions-gh-pages: use GITHUB_ACTOR if available, otherwise fall back to github-actions[bot]
const actor = process.env.GITHUB_ACTOR
const GIT_USER_NAME = actor ?? 'github-actions[bot]'
const GIT_USER_EMAIL = actor
  ? `${actor}@users.noreply.github.com`
  : 'github-actions[bot]@users.noreply.github.com'

function exec(command: string, cwd?: string): string {
  return execSync(command, { encoding: 'utf-8', cwd }).trim()
}

function branchExists(branch: string): boolean {
  try {
    exec(`git rev-parse --verify origin/${branch}`)
    return true
  } catch {
    return false
  }
}

export function deployToGitHubPages(options: DeployOptions): void {
  const { branch, sourceDir, targetDir, commitMessage } = options

  if (!targetDir) {
    throw new Error('targetDir is required')
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
    exec(`git config user.name "${GIT_USER_NAME}"`, worktreeDir)
    exec(`git config user.email "${GIT_USER_EMAIL}"`, worktreeDir)

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
    exec(`git commit -m "${commitMessage}"`, worktreeDir)
    try {
      exec(`git push origin ${branch}`, worktreeDir)
    } catch {
      // If push fails (e.g., remote has new commits), pull and retry
      exec(`git pull --rebase origin ${branch}`, worktreeDir)
      exec(`git push origin ${branch}`, worktreeDir)
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
