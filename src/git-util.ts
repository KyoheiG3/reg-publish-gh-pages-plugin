import { execSync } from 'node:child_process'

export interface RepoInfo {
  owner: string
  repo: string
}

function getRepoFromEnv(): RepoInfo | undefined {
  const githubRepository = process.env.GITHUB_REPOSITORY
  if (githubRepository) {
    const [owner, repo] = githubRepository.split('/')
    if (owner && repo) {
      return { owner, repo }
    }
  }
  return undefined
}

function getRepoFromGitRemote(): RepoInfo | undefined {
  try {
    const url = execSync('git remote get-url origin', { encoding: 'utf-8' })
      .trim()

    // SSH: git@github.com:owner/repo.git
    // HTTPS: https://github.com/owner/repo.git
    const match = url.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/)

    if (match && match[1] && match[2]) {
      return { owner: match[1], repo: match[2] }
    }
  } catch {
    // Failed to execute git command
  }
  return undefined
}

export function getRepoInfo(): RepoInfo | undefined {
  return getRepoFromEnv() ?? getRepoFromGitRemote()
}
