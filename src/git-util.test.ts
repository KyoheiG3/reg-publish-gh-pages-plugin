import { execSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}))

const mockExecSync = vi.mocked(execSync)

describe('getRepoInfo', () => {
  const originalGithubRepository = process.env.GITHUB_REPOSITORY

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (originalGithubRepository !== undefined) {
      process.env.GITHUB_REPOSITORY = originalGithubRepository
    } else {
      delete process.env.GITHUB_REPOSITORY
    }
    vi.restoreAllMocks()
  })

  describe('Given GITHUB_REPOSITORY environment variable', () => {
    describe('When GITHUB_REPOSITORY is set with valid owner/repo format', () => {
      it('Then it should return repo info from environment variable', async () => {
        process.env.GITHUB_REPOSITORY = 'test-owner/test-repo'

        const { getRepoInfo } = await import('./git-util.js')
        const result = getRepoInfo()

        expect(result).toEqual({ owner: 'test-owner', repo: 'test-repo' })
        expect(mockExecSync).not.toHaveBeenCalled()
      })
    })

    describe('When GITHUB_REPOSITORY is set with only owner (no slash)', () => {
      it('Then it should fall back to git remote', async () => {
        process.env.GITHUB_REPOSITORY = 'invalid-format'
        mockExecSync.mockReturnValue('git@github.com:remote-owner/remote-repo.git\n')

        const { getRepoInfo } = await import('./git-util.js')
        const result = getRepoInfo()

        expect(result).toEqual({ owner: 'remote-owner', repo: 'remote-repo' })
      })
    })

    describe('When GITHUB_REPOSITORY is set with empty owner', () => {
      it('Then it should fall back to git remote', async () => {
        process.env.GITHUB_REPOSITORY = '/repo-only'
        mockExecSync.mockReturnValue('git@github.com:remote-owner/remote-repo.git\n')

        const { getRepoInfo } = await import('./git-util.js')
        const result = getRepoInfo()

        expect(result).toEqual({ owner: 'remote-owner', repo: 'remote-repo' })
      })
    })

    describe('When GITHUB_REPOSITORY is set with empty repo', () => {
      it('Then it should fall back to git remote', async () => {
        process.env.GITHUB_REPOSITORY = 'owner-only/'
        mockExecSync.mockReturnValue('git@github.com:remote-owner/remote-repo.git\n')

        const { getRepoInfo } = await import('./git-util.js')
        const result = getRepoInfo()

        expect(result).toEqual({ owner: 'remote-owner', repo: 'remote-repo' })
      })
    })
  })

  describe('Given git remote URL', () => {
    beforeEach(() => {
      delete process.env.GITHUB_REPOSITORY
    })

    describe('When remote URL is SSH format', () => {
      it('Then it should parse owner and repo from SSH URL', async () => {
        mockExecSync.mockReturnValue('git@github.com:ssh-owner/ssh-repo.git\n')

        const { getRepoInfo } = await import('./git-util.js')
        const result = getRepoInfo()

        expect(result).toEqual({ owner: 'ssh-owner', repo: 'ssh-repo' })
      })
    })

    describe('When remote URL is SSH format without .git suffix', () => {
      it('Then it should parse owner and repo', async () => {
        mockExecSync.mockReturnValue('git@github.com:ssh-owner/ssh-repo\n')

        const { getRepoInfo } = await import('./git-util.js')
        const result = getRepoInfo()

        expect(result).toEqual({ owner: 'ssh-owner', repo: 'ssh-repo' })
      })
    })

    describe('When remote URL is HTTPS format', () => {
      it('Then it should parse owner and repo from HTTPS URL', async () => {
        mockExecSync.mockReturnValue('https://github.com/https-owner/https-repo.git\n')

        const { getRepoInfo } = await import('./git-util.js')
        const result = getRepoInfo()

        expect(result).toEqual({ owner: 'https-owner', repo: 'https-repo' })
      })
    })

    describe('When remote URL is HTTPS format without .git suffix', () => {
      it('Then it should parse owner and repo', async () => {
        mockExecSync.mockReturnValue('https://github.com/https-owner/https-repo\n')

        const { getRepoInfo } = await import('./git-util.js')
        const result = getRepoInfo()

        expect(result).toEqual({ owner: 'https-owner', repo: 'https-repo' })
      })
    })

    describe('When remote URL does not match GitHub pattern', () => {
      it('Then it should return undefined', async () => {
        mockExecSync.mockReturnValue('https://gitlab.com/owner/repo.git\n')

        const { getRepoInfo } = await import('./git-util.js')
        const result = getRepoInfo()

        expect(result).toBeUndefined()
      })
    })

    describe('When git command fails', () => {
      it('Then it should return undefined', async () => {
        mockExecSync.mockImplementation(() => {
          throw new Error('Not a git repository')
        })

        const { getRepoInfo } = await import('./git-util.js')
        const result = getRepoInfo()

        expect(result).toBeUndefined()
      })
    })
  })

  describe('Given neither GITHUB_REPOSITORY nor valid git remote', () => {
    describe('When both sources are unavailable', () => {
      it('Then it should return undefined', async () => {
        delete process.env.GITHUB_REPOSITORY
        mockExecSync.mockImplementation(() => {
          throw new Error('Not a git repository')
        })

        const { getRepoInfo } = await import('./git-util.js')
        const result = getRepoInfo()

        expect(result).toBeUndefined()
      })
    })
  })
})
