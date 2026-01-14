import { getIDToken } from '@actions/core'
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import * as tar from 'tar'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type DeployOptions,
  deployToGitHubPages,
  isGitHubActions,
} from './git-deploy'

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
  rmSync: vi.fn(),
  unlinkSync: vi.fn(),
}))

vi.mock('@actions/core', () => ({
  getIDToken: vi.fn(),
}))

const mockUploadArtifact = vi.fn()
vi.mock('@actions/artifact', () => ({
  DefaultArtifactClient: class {
    uploadArtifact = mockUploadArtifact
  },
}))

vi.mock('tar', () => ({
  create: vi.fn(),
}))

const mockExecSync = vi.mocked(execSync)
const mockExistsSync = vi.mocked(existsSync)
const mockMkdirSync = vi.mocked(mkdirSync)
const mockRenameSync = vi.mocked(renameSync)
const mockRmSync = vi.mocked(rmSync)
const mockGetIDToken = vi.mocked(getIDToken)
const mockTarCreate = vi.mocked(tar.create)

function createDefaultOptions(
  overrides: Partial<DeployOptions> = {},
): DeployOptions {
  return {
    branch: 'gh-pages',
    sourceDir: 'dist',
    targetDir: 'reports',
    commitMessage: 'deploy',
    ...overrides,
  }
}

interface ExistsConfig {
  worktree?: boolean
  parentDir?: boolean
  destDir?: boolean
}

function setupExistsSyncMock(config: ExistsConfig = {}) {
  const { worktree = false, parentDir = true, destDir = false } = config
  mockExistsSync.mockImplementation((path) => {
    const pathStr = String(path)
    if (pathStr === '.gh-pages-worktree') return worktree
    if (
      pathStr.match(/\.gh-pages-worktree\/[^/]+$/)
      && !pathStr.includes('reports')
    ) return parentDir
    if (pathStr.includes('reports')) return destDir
    return false
  })
}

interface ExecConfig {
  branchExists?: boolean
  hasChanges?: boolean
  pushFails?: boolean
  pushFailCount?: number
  commitFails?: boolean
}

function setupExecSyncMock(config: ExecConfig = {}) {
  const {
    branchExists = false,
    hasChanges = true,
    pushFails = false,
    pushFailCount = 1,
    commitFails = false,
  } = config
  let pushAttempts = 0

  mockExecSync.mockImplementation((command) => {
    const cmd = String(command)
    if (cmd.includes('git ls-remote --heads origin')) {
      return branchExists ? 'abc123\trefs/heads/gh-pages' : ''
    }
    if (cmd.includes('git diff --cached --quiet')) {
      if (hasChanges) throw new Error('has changes')
      return ''
    }
    if (cmd.includes('git commit') && commitFails) {
      throw new Error('commit failed')
    }
    if (cmd.includes('git push origin')) {
      pushAttempts++
      if (pushFails && pushAttempts <= pushFailCount) {
        throw new Error('push failed')
      }
    }
    return ''
  })
}

describe('deployToGitHubPages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Given targetDir is empty', () => {
    describe('When deployToGitHubPages is called', () => {
      it('Then it should throw an error', async () => {
        await expect(
          deployToGitHubPages(createDefaultOptions({ targetDir: '' })),
        ).rejects.toThrow('targetDir is required')
      })
    })
  })

  describe('Given worktree directory already exists', () => {
    beforeEach(() => {
      setupExistsSyncMock({ worktree: true })
      setupExecSyncMock()
    })

    describe('When deployToGitHubPages is called', () => {
      it('Then it should remove existing worktree before proceeding', async () => {
        await deployToGitHubPages(createDefaultOptions())

        expect(mockExecSync).toHaveBeenCalledWith(
          'git worktree remove --force .gh-pages-worktree',
          expect.any(Object),
        )
      })
    })
  })

  describe('Given the branch exists on remote', () => {
    beforeEach(() => {
      setupExistsSyncMock()
      setupExecSyncMock({ branchExists: true })
    })

    describe('When deployToGitHubPages is called', () => {
      it('Then it should add worktree for existing branch', async () => {
        await deployToGitHubPages(createDefaultOptions())

        expect(mockExecSync).toHaveBeenCalledWith(
          'git fetch origin gh-pages',
          expect.any(Object),
        )
        expect(mockExecSync).toHaveBeenCalledWith(
          'git worktree add .gh-pages-worktree origin/gh-pages',
          expect.any(Object),
        )
        expect(mockExecSync).toHaveBeenCalledWith(
          'git checkout -B gh-pages',
          expect.objectContaining({ cwd: '.gh-pages-worktree' }),
        )
      })
    })
  })

  describe('Given git ls-remote command fails', () => {
    beforeEach(() => {
      setupExistsSyncMock()
      mockExecSync.mockImplementation((command) => {
        const cmd = String(command)
        if (cmd.includes('git ls-remote --heads origin')) {
          throw new Error('network error')
        }
        if (cmd.includes('git diff --cached --quiet')) {
          throw new Error('has changes')
        }
        return ''
      })
    })

    describe('When deployToGitHubPages is called', () => {
      it('Then it should treat as branch not existing and create orphan branch', async () => {
        await deployToGitHubPages(createDefaultOptions())

        expect(mockExecSync).toHaveBeenCalledWith(
          'git worktree add --detach .gh-pages-worktree',
          expect.any(Object),
        )
        expect(mockExecSync).toHaveBeenCalledWith(
          'git checkout --orphan gh-pages',
          expect.objectContaining({ cwd: '.gh-pages-worktree' }),
        )
      })
    })
  })

  describe('Given the branch does not exist on remote', () => {
    beforeEach(() => {
      setupExistsSyncMock()
      setupExecSyncMock({ branchExists: false })
    })

    describe('When deployToGitHubPages is called', () => {
      it('Then it should create orphan branch', async () => {
        await deployToGitHubPages(createDefaultOptions())

        expect(mockExecSync).toHaveBeenCalledWith(
          'git worktree add --detach .gh-pages-worktree',
          expect.any(Object),
        )
        expect(mockExecSync).toHaveBeenCalledWith(
          'git checkout --orphan gh-pages',
          expect.objectContaining({ cwd: '.gh-pages-worktree' }),
        )
        expect(mockExecSync).toHaveBeenCalledWith(
          'git rm -rf .',
          expect.objectContaining({ cwd: '.gh-pages-worktree' }),
        )
      })
    })
  })

  describe('Given parent directory of target does not exist', () => {
    beforeEach(() => {
      mockExistsSync.mockImplementation((path) => {
        const pathStr = String(path)
        if (pathStr === '.gh-pages-worktree') return false
        if (pathStr === '.gh-pages-worktree/nested') return false
        return false
      })
      setupExecSyncMock()
    })

    describe('When deployToGitHubPages is called', () => {
      it('Then it should create parent directory', async () => {
        await deployToGitHubPages(
          createDefaultOptions({ targetDir: 'nested/reports' }),
        )

        expect(mockMkdirSync).toHaveBeenCalledWith(
          '.gh-pages-worktree/nested',
          {
            recursive: true,
          },
        )
      })
    })
  })

  describe('Given parent directory of target already exists', () => {
    beforeEach(() => {
      mockExistsSync.mockImplementation((path) => {
        const pathStr = String(path)
        if (pathStr === '.gh-pages-worktree') return false
        if (pathStr === '.gh-pages-worktree/nested') return true
        return false
      })
      setupExecSyncMock()
    })

    describe('When deployToGitHubPages is called', () => {
      it('Then it should not create parent directory', async () => {
        await deployToGitHubPages(
          createDefaultOptions({ targetDir: 'nested/reports' }),
        )

        expect(mockMkdirSync).not.toHaveBeenCalled()
      })
    })
  })

  describe('Given target directory already exists', () => {
    beforeEach(() => {
      setupExistsSyncMock({ destDir: true })
      setupExecSyncMock()
    })

    describe('When deployToGitHubPages is called', () => {
      it('Then it should remove existing target directory', async () => {
        await deployToGitHubPages(createDefaultOptions())

        expect(mockRmSync).toHaveBeenCalledWith('.gh-pages-worktree/reports', {
          recursive: true,
          force: true,
        })
      })
    })
  })

  describe('Given there are no changes to commit', () => {
    beforeEach(() => {
      setupExistsSyncMock()
      setupExecSyncMock({ hasChanges: false })
    })

    describe('When deployToGitHubPages is called', () => {
      it('Then it should restore files and skip commit', async () => {
        await deployToGitHubPages(createDefaultOptions())

        expect(mockRenameSync).toHaveBeenCalledWith(
          'dist',
          '.gh-pages-worktree/reports',
        )
        expect(mockRenameSync).toHaveBeenCalledWith(
          '.gh-pages-worktree/reports',
          'dist',
        )
        expect(mockExecSync).not.toHaveBeenCalledWith(
          expect.stringContaining('git commit'),
          expect.any(Object),
        )
      })
    })
  })

  describe('Given there are changes to commit', () => {
    beforeEach(() => {
      setupExistsSyncMock()
      setupExecSyncMock({ hasChanges: true })
    })

    describe('When deployToGitHubPages is called', () => {
      it('Then it should commit and push', async () => {
        await deployToGitHubPages(
          createDefaultOptions({ commitMessage: 'deploy: abc123' }),
        )

        expect(mockExecSync).toHaveBeenCalledWith(
          'git commit -m "deploy: abc123"',
          expect.objectContaining({ cwd: '.gh-pages-worktree' }),
        )
        expect(mockExecSync).toHaveBeenCalledWith(
          'git push origin gh-pages',
          expect.objectContaining({ cwd: '.gh-pages-worktree' }),
        )
      })
    })

    describe('When commitMessage contains double quotes', () => {
      it('Then it should escape double quotes', async () => {
        await deployToGitHubPages(
          createDefaultOptions({ commitMessage: 'deploy: "test"' }),
        )

        expect(mockExecSync).toHaveBeenCalledWith(
          'git commit -m "deploy: \\"test\\""',
          expect.objectContaining({ cwd: '.gh-pages-worktree' }),
        )
      })
    })
  })

  describe('Given git push fails once', () => {
    beforeEach(() => {
      setupExistsSyncMock()
      setupExecSyncMock({ pushFails: true, pushFailCount: 1 })
    })

    describe('When deployToGitHubPages is called', () => {
      it('Then it should pull --rebase and retry push', async () => {
        await deployToGitHubPages(createDefaultOptions())

        expect(mockExecSync).toHaveBeenCalledWith(
          'git pull --rebase origin gh-pages',
          expect.objectContaining({ cwd: '.gh-pages-worktree' }),
        )
        const pushCalls = mockExecSync.mock.calls.filter(([cmd]) =>
          String(cmd).includes('git push origin gh-pages')
        )
        expect(pushCalls).toHaveLength(2)
      })
    })
  })

  describe('Given an error occurs during commit', () => {
    beforeEach(() => {
      let destExists = false
      mockExistsSync.mockImplementation((path) => {
        const pathStr = String(path)
        if (pathStr === '.gh-pages-worktree') return false
        if (pathStr === '.gh-pages-worktree/reports') return destExists
        return false
      })
      mockRenameSync.mockImplementation((src, dest) => {
        if (src === 'dist' && dest === '.gh-pages-worktree/reports') {
          destExists = true
        }
        if (src === '.gh-pages-worktree/reports' && dest === 'dist') {
          destExists = false
        }
      })
      setupExecSyncMock({ commitFails: true })
    })

    describe('When deployToGitHubPages is called', () => {
      it('Then it should restore files in finally block', async () => {
        await expect(
          deployToGitHubPages(createDefaultOptions()),
        ).rejects.toThrow('commit failed')

        const restoreCalls = mockRenameSync.mock.calls.filter(
          ([src, dest]) =>
            src === '.gh-pages-worktree/reports' && dest === 'dist',
        )
        expect(restoreCalls.length).toBeGreaterThanOrEqual(1)
      })
    })
  })

  describe('Given worktree exists after deployment', () => {
    beforeEach(() => {
      let callCount = 0
      mockExistsSync.mockImplementation((path) => {
        const pathStr = String(path)
        if (pathStr === '.gh-pages-worktree') {
          callCount++
          return callCount > 1
        }
        return false
      })
      setupExecSyncMock()
    })

    describe('When deployToGitHubPages completes', () => {
      it('Then it should cleanup worktree in finally block', async () => {
        await deployToGitHubPages(createDefaultOptions())

        const worktreeRemoveCalls = mockExecSync.mock.calls.filter(([cmd]) =>
          String(cmd).includes('git worktree remove --force .gh-pages-worktree')
        )
        expect(worktreeRemoveCalls.length).toBeGreaterThanOrEqual(1)
      })
    })
  })

  describe('Given files were moved but not restored due to push error', () => {
    beforeEach(() => {
      let destExists = false
      mockExistsSync.mockImplementation((path) => {
        const pathStr = String(path)
        if (pathStr === '.gh-pages-worktree') return false
        if (pathStr === '.gh-pages-worktree/reports') return destExists
        return false
      })
      mockRenameSync.mockImplementation((src, dest) => {
        if (src === 'dist' && dest === '.gh-pages-worktree/reports') {
          destExists = true
        }
        if (src === '.gh-pages-worktree/reports' && dest === 'dist') {
          destExists = false
        }
      })
      setupExecSyncMock({ pushFails: true, pushFailCount: 2 })
    })

    describe('When deployToGitHubPages fails', () => {
      it('Then it should restore files from destDir to sourceDir', async () => {
        await expect(
          deployToGitHubPages(createDefaultOptions()),
        ).rejects.toThrow()

        const restoreCalls = mockRenameSync.mock.calls.filter(
          ([src, dest]) =>
            src === '.gh-pages-worktree/reports' && dest === 'dist',
        )
        expect(restoreCalls.length).toBeGreaterThanOrEqual(1)
      })
    })
  })

  describe('Given GITHUB_ACTOR environment variable', () => {
    const originalActor = process.env.GITHUB_ACTOR

    afterEach(() => {
      if (originalActor !== undefined) {
        process.env.GITHUB_ACTOR = originalActor
      } else {
        delete process.env.GITHUB_ACTOR
      }
    })

    describe('When GITHUB_ACTOR is set', () => {
      it('Then it should use GITHUB_ACTOR for git user config', async () => {
        process.env.GITHUB_ACTOR = 'test-user'
        vi.resetModules()
        setupExistsSyncMock()
        setupExecSyncMock()

        const { deployToGitHubPages: deploy } = await import('./git-deploy.js')
        await deploy(createDefaultOptions())

        expect(mockExecSync).toHaveBeenCalledWith(
          'git config user.name "test-user"',
          expect.objectContaining({ cwd: '.gh-pages-worktree' }),
        )
        expect(mockExecSync).toHaveBeenCalledWith(
          'git config user.email "test-user@users.noreply.github.com"',
          expect.objectContaining({ cwd: '.gh-pages-worktree' }),
        )
      })
    })

    describe('When GITHUB_ACTOR is not set', () => {
      it('Then it should use default github-actions[bot] for git user config', async () => {
        delete process.env.GITHUB_ACTOR
        vi.resetModules()
        setupExistsSyncMock()
        setupExecSyncMock()

        const { deployToGitHubPages: deploy } = await import('./git-deploy.js')
        await deploy(createDefaultOptions())

        expect(mockExecSync).toHaveBeenCalledWith(
          'git config user.name "github-actions[bot]"',
          expect.objectContaining({ cwd: '.gh-pages-worktree' }),
        )
        expect(mockExecSync).toHaveBeenCalledWith(
          'git config user.email "github-actions[bot]@users.noreply.github.com"',
          expect.objectContaining({ cwd: '.gh-pages-worktree' }),
        )
      })
    })
  })

  describe('isGitHubActions', () => {
    const originalGithubActions = process.env.GITHUB_ACTIONS

    afterEach(() => {
      if (originalGithubActions !== undefined) {
        process.env.GITHUB_ACTIONS = originalGithubActions
      } else {
        delete process.env.GITHUB_ACTIONS
      }
    })

    describe('When GITHUB_ACTIONS is set to "true"', () => {
      it('Then it should return true', () => {
        process.env.GITHUB_ACTIONS = 'true'
        expect(isGitHubActions()).toBe(true)
      })
    })

    describe('When GITHUB_ACTIONS is not set', () => {
      it('Then it should return false', () => {
        delete process.env.GITHUB_ACTIONS
        expect(isGitHubActions()).toBe(false)
      })
    })
  })

  describe('Given artifactDeploy is enabled', () => {
    describe('When not running in GitHub Actions', () => {
      beforeEach(() => {
        delete process.env.GITHUB_ACTIONS
      })

      it('Then it should throw an error', async () => {
        await expect(
          deployToGitHubPages(
            createDefaultOptions({
              artifactDeploy: true,
              repoInfo: { owner: 'test-owner', repo: 'test-repo' },
            }),
          ),
        ).rejects.toThrow('artifactDeploy is only available in GitHub Actions')
      })
    })

    describe('When repoInfo is missing', () => {
      beforeEach(() => {
        process.env.GITHUB_ACTIONS = 'true'
      })

      afterEach(() => {
        delete process.env.GITHUB_ACTIONS
      })

      it('Then it should throw an error', async () => {
        await expect(
          deployToGitHubPages(
            createDefaultOptions({
              artifactDeploy: true,
            }),
          ),
        ).rejects.toThrow('repoInfo is required for artifactDeploy')
      })
    })

    describe('When all requirements are met', () => {
      const originalGithubActions = process.env.GITHUB_ACTIONS
      const originalGithubToken = process.env.GITHUB_TOKEN
      const originalGithubSha = process.env.GITHUB_SHA
      const originalRunnerTemp = process.env.RUNNER_TEMP

      beforeEach(() => {
        process.env.GITHUB_ACTIONS = 'true'
        process.env.GITHUB_TOKEN = 'test-token'
        process.env.GITHUB_SHA = 'abc123'
        process.env.RUNNER_TEMP = '/tmp'
        setupExistsSyncMock()
        setupExecSyncMock()
        mockTarCreate.mockResolvedValue(undefined)
        mockGetIDToken.mockResolvedValue('oidc-token')
        mockUploadArtifact.mockResolvedValue({ id: 12345 })
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({}),
        })
      })

      afterEach(() => {
        if (originalGithubActions !== undefined) {
          process.env.GITHUB_ACTIONS = originalGithubActions
        } else {
          delete process.env.GITHUB_ACTIONS
        }
        if (originalGithubToken !== undefined) {
          process.env.GITHUB_TOKEN = originalGithubToken
        } else {
          delete process.env.GITHUB_TOKEN
        }
        if (originalGithubSha !== undefined) {
          process.env.GITHUB_SHA = originalGithubSha
        } else {
          delete process.env.GITHUB_SHA
        }
        if (originalRunnerTemp !== undefined) {
          process.env.RUNNER_TEMP = originalRunnerTemp
        } else {
          delete process.env.RUNNER_TEMP
        }
        vi.restoreAllMocks()
      })

      it('Then it should create tar, upload artifact, and deploy to pages', async () => {
        await deployToGitHubPages(
          createDefaultOptions({
            artifactDeploy: true,
            repoInfo: { owner: 'test-owner', repo: 'test-repo' },
          }),
        )

        expect(mockTarCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            file: '/tmp/artifact.tar',
            cwd: '.gh-pages-worktree',
          }),
          ['.'],
        )
        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.github.com/repos/test-owner/test-repo/pages/deployments',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              Authorization: 'Bearer test-token',
            }),
          }),
        )
      })

      it('Then it should throw error when artifact upload fails', async () => {
        mockUploadArtifact.mockResolvedValue({ id: undefined })

        await expect(
          deployToGitHubPages(
            createDefaultOptions({
              artifactDeploy: true,
              repoInfo: { owner: 'test-owner', repo: 'test-repo' },
            }),
          ),
        ).rejects.toThrow('Failed to upload artifact')
      })

      it('Then it should throw error when pages deployment fails', async () => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: false,
          text: () => Promise.resolve('Deployment failed'),
        })

        await expect(
          deployToGitHubPages(
            createDefaultOptions({
              artifactDeploy: true,
              repoInfo: { owner: 'test-owner', repo: 'test-repo' },
            }),
          ),
        ).rejects.toThrow('Failed to create Pages deployment: Deployment failed')
      })

      it('Then it should filter out .git directory from tar', async () => {
        await deployToGitHubPages(
          createDefaultOptions({
            artifactDeploy: true,
            repoInfo: { owner: 'test-owner', repo: 'test-repo' },
          }),
        )

        const tarCreateCall = mockTarCreate.mock.calls[0]!
        const options = tarCreateCall[0] as { filter: (path: string) => boolean }
        expect(options.filter('.git')).toBe(false)
        expect(options.filter('.git/')).toBe(false)
        expect(options.filter('.git/config')).toBe(false)
        expect(options.filter('index.html')).toBe(true)
        expect(options.filter('reports/index.html')).toBe(true)
      })

      it('Then it should cleanup tar file in finally block', async () => {
        const mockUnlinkSync = vi.mocked(
          await import('node:fs').then((m) => m.unlinkSync),
        )
        mockExistsSync.mockImplementation((path) => {
          const pathStr = String(path)
          if (pathStr === '/tmp/artifact.tar') return true
          if (pathStr === '.gh-pages-worktree') return false
          return false
        })

        await deployToGitHubPages(
          createDefaultOptions({
            artifactDeploy: true,
            repoInfo: { owner: 'test-owner', repo: 'test-repo' },
          }),
        )

        expect(mockUnlinkSync).toHaveBeenCalledWith('/tmp/artifact.tar')
      })
    })
  })
})
