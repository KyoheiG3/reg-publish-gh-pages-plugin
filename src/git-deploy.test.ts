import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type DeployOptions, deployToGitHubPages } from './git-deploy'

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
  rmSync: vi.fn(),
}))

const mockExecSync = vi.mocked(execSync)
const mockExistsSync = vi.mocked(existsSync)
const mockMkdirSync = vi.mocked(mkdirSync)
const mockRenameSync = vi.mocked(renameSync)
const mockRmSync = vi.mocked(rmSync)

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

})
