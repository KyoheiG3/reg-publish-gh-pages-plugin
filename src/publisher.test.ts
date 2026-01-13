import type { PluginCreateOptions, PluginLogger } from 'reg-suit-interface'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deployToGitHubPages } from './git-deploy'
import { getRepoInfo } from './git-util'
import { GhPagesPublisherPlugin, type PluginConfig } from './publisher'

vi.mock('./git-deploy', () => ({
  deployToGitHubPages: vi.fn(),
}))

vi.mock('./git-util', () => ({
  getRepoInfo: vi.fn(),
}))

const mockDeployToGitHubPages = vi.mocked(deployToGitHubPages)
const mockGetRepoInfo = vi.mocked(getRepoInfo)

function createMockLogger(): PluginLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    verbose: vi.fn(),
    colors: {} as PluginLogger['colors'],
    getSpinner: vi.fn(),
    getProgressBar: vi.fn(),
  }
}

function createMockConfig(
  options: Partial<PluginConfig> = {},
  logger: PluginLogger = createMockLogger(),
): PluginCreateOptions<PluginConfig> {
  return {
    coreConfig: {
      actualDir: '.reg/actual',
      workingDir: '.reg',
    },
    logger,
    workingDirs: {
      base: '.reg',
      actualDir: '.reg/actual',
      expectedDir: '.reg/expected',
      diffDir: '.reg/diff',
    },
    options: {
      branch: undefined,
      outDir: undefined,
      sourceDir: undefined,
      commitMessage: undefined,
      includeCommitHash: undefined,
      ...options,
    },
    noEmit: false,
  }
}

function createInitializedPlugin(
  options: Partial<PluginConfig> = {},
  logger?: PluginLogger,
): { plugin: GhPagesPublisherPlugin; logger: PluginLogger } {
  const mockLogger = logger ?? createMockLogger()
  const plugin = new GhPagesPublisherPlugin()
  plugin.init(createMockConfig(options, mockLogger))
  return { plugin, logger: mockLogger }
}

describe('GhPagesPublisherPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('publish', () => {
    describe('Given repository info is not available', () => {
      beforeEach(() => {
        mockGetRepoInfo.mockReturnValue(undefined)
      })

      describe('When publish is called', () => {
        it('Then it should warn and return undefined reportUrl', async () => {
          const { plugin, logger } = createInitializedPlugin()

          const result = await plugin.publish('abc123')

          expect(logger.warn).toHaveBeenCalledWith(
            'Unable to determine repository info. Make sure to run this in a GitHub repository or set GITHUB_REPOSITORY environment variable.',
          )
          expect(result).toEqual({ reportUrl: undefined })
          expect(mockDeployToGitHubPages).not.toHaveBeenCalled()
        })
      })
    })

    describe('Given repository info is available', () => {
      beforeEach(() => {
        mockGetRepoInfo.mockReturnValue({
          owner: 'test-owner',
          repo: 'test-repo',
        })
      })

      describe('When branch is not set', () => {
        it('Then it should return reportUrl without deploying', async () => {
          const { plugin } = createInitializedPlugin({ outDir: 'reports' })

          const result = await plugin.publish('abc123')

          expect(result).toEqual({
            reportUrl: 'https://test-owner.github.io/test-repo/reports/',
          })
          expect(mockDeployToGitHubPages).not.toHaveBeenCalled()
        })
      })

      describe('When branch is set but targetDir is empty', () => {
        describe('When outDir is empty and includeCommitHash is false', () => {
          it('Then it should warn and skip deployment', async () => {
            const { plugin, logger } = createInitializedPlugin({
              branch: 'gh-pages',
            })

            const result = await plugin.publish('abc123')

            expect(logger.warn).toHaveBeenCalledWith(
              'Deployment skipped. Set outDir option or enable includeCommitHash.',
            )
            expect(mockDeployToGitHubPages).not.toHaveBeenCalled()
            expect(result).toEqual({
              reportUrl: 'https://test-owner.github.io/test-repo/',
            })
          })
        })
      })

      describe('When branch is set and outDir is provided', () => {
        it('Then it should deploy with outDir as targetDir', async () => {
          const { plugin } = createInitializedPlugin({
            branch: 'gh-pages',
            outDir: 'reports',
          })

          const result = await plugin.publish('abc123')

          expect(mockDeployToGitHubPages).toHaveBeenCalledWith({
            branch: 'gh-pages',
            sourceDir: '.reg',
            targetDir: 'reports',
            commitMessage: 'deploy: abc123',
          })
          expect(result).toEqual({
            reportUrl: 'https://test-owner.github.io/test-repo/reports/',
          })
        })
      })

      describe('When branch is set and includeCommitHash is true', () => {
        it('Then it should deploy with key as targetDir', async () => {
          const { plugin } = createInitializedPlugin({
            branch: 'gh-pages',
            includeCommitHash: true,
          })

          const result = await plugin.publish('abc123')

          expect(mockDeployToGitHubPages).toHaveBeenCalledWith({
            branch: 'gh-pages',
            sourceDir: '.reg',
            targetDir: 'abc123',
            commitMessage: 'deploy: abc123',
          })
          expect(result).toEqual({
            reportUrl: 'https://test-owner.github.io/test-repo/abc123/',
          })
        })
      })

      describe('When branch is set with outDir and includeCommitHash', () => {
        it('Then it should deploy with combined targetDir', async () => {
          const { plugin } = createInitializedPlugin({
            branch: 'gh-pages',
            outDir: 'reports',
            includeCommitHash: true,
          })

          const result = await plugin.publish('abc123')

          expect(mockDeployToGitHubPages).toHaveBeenCalledWith({
            branch: 'gh-pages',
            sourceDir: '.reg',
            targetDir: 'reports/abc123',
            commitMessage: 'deploy: abc123',
          })
          expect(result).toEqual({
            reportUrl: 'https://test-owner.github.io/test-repo/reports/abc123/',
          })
        })
      })

      describe('When sourceDir is provided', () => {
        it('Then it should use custom sourceDir', async () => {
          const { plugin } = createInitializedPlugin({
            branch: 'gh-pages',
            outDir: 'reports',
            sourceDir: 'custom-source',
          })

          await plugin.publish('abc123')

          expect(mockDeployToGitHubPages).toHaveBeenCalledWith(
            expect.objectContaining({
              sourceDir: 'custom-source',
            }),
          )
        })
      })

      describe('When commitMessage is provided', () => {
        it('Then it should use custom commitMessage', async () => {
          const { plugin } = createInitializedPlugin({
            branch: 'gh-pages',
            outDir: 'reports',
            commitMessage: 'custom message',
          })

          await plugin.publish('abc123')

          expect(mockDeployToGitHubPages).toHaveBeenCalledWith(
            expect.objectContaining({
              commitMessage: 'custom message',
            }),
          )
        })
      })

      describe('When reportPath is provided', () => {
        describe('When reportPath starts with http', () => {
          it('Then it should use reportPath as-is for reportUrl', async () => {
            const { plugin } = createInitializedPlugin({
              branch: 'gh-pages',
              outDir: 'reports',
              reportPath: 'https://custom.example.com/vrt',
            })

            const result = await plugin.publish('abc123')

            expect(result).toEqual({
              reportUrl: 'https://custom.example.com/vrt/',
            })
          })

          it('Then it should preserve trailing slash if present', async () => {
            const { plugin } = createInitializedPlugin({
              reportPath: 'https://custom.example.com/vrt/',
            })

            const result = await plugin.publish('abc123')

            expect(result).toEqual({
              reportUrl: 'https://custom.example.com/vrt/',
            })
          })
        })

        describe('When reportPath does not start with http', () => {
          it('Then it should use reportPath instead of targetDir', async () => {
            const { plugin } = createInitializedPlugin({
              branch: 'gh-pages',
              outDir: 'reports',
              includeCommitHash: true,
              reportPath: 'custom/path',
            })

            const result = await plugin.publish('abc123')

            expect(result).toEqual({
              reportUrl: 'https://test-owner.github.io/test-repo/custom/path/',
            })
          })
        })

        describe('When reportPath is not set', () => {
          it('Then it should use targetDir for reportUrl', async () => {
            const { plugin } = createInitializedPlugin({
              outDir: 'reports',
              includeCommitHash: true,
            })

            const result = await plugin.publish('abc123')

            expect(result).toEqual({
              reportUrl:
                'https://test-owner.github.io/test-repo/reports/abc123/',
            })
          })
        })
      })
    })
  })

  describe('fetch', () => {
    describe('When fetch is called', () => {
      it('Then it should warn that fetch is not implemented', async () => {
        const { plugin, logger } = createInitializedPlugin()

        const result = await plugin.fetch()

        expect(logger.warn).toHaveBeenCalledWith(
          'This plugin is for `reg-suit publish` only. fetch() is not implemented.',
        )
        expect(result).toBeUndefined()
      })
    })
  })
})
