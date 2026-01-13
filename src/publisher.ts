import type {
  PluginCreateOptions,
  PluginLogger,
  PublisherPlugin,
  WorkingDirectoryInfo,
} from 'reg-suit-interface'
import { deployToGitHubPages } from './git-deploy'
import { getRepoInfo } from './git-util'

export interface PluginConfig {
  branch?: string
  outDir?: string
  sourceDir?: string
  commitMessage?: string
  includeCommitHash?: boolean
}

export class GhPagesPublisherPlugin implements PublisherPlugin<PluginConfig> {
  private logger!: PluginLogger
  private workingDirs!: WorkingDirectoryInfo
  private branch?: string
  private outDir!: string
  private sourceDir?: string
  private commitMessage?: string
  private includeCommitHash!: boolean

  init(config: PluginCreateOptions<PluginConfig>) {
    this.logger = config.logger
    this.workingDirs = config.workingDirs
    this.branch = config.options.branch
    this.outDir = config.options.outDir ?? ''
    this.sourceDir = config.options.sourceDir
    this.commitMessage = config.options.commitMessage
    this.includeCommitHash = config.options.includeCommitHash ?? false
  }

  publish(key: string) {
    const info = getRepoInfo()

    if (!info) {
      this.logger.warn(
        'Unable to determine repository info. Make sure to run this in a GitHub repository or set GITHUB_REPOSITORY environment variable.',
      )
      return Promise.resolve({ reportUrl: undefined })
    }

    const targetDir = [
      this.outDir,
      this.includeCommitHash ? key : '',
    ]
      .filter(Boolean)
      .join('/')

    if (this.branch) {
      if (targetDir) {
        deployToGitHubPages({
          branch: this.branch,
          sourceDir: this.sourceDir ?? this.workingDirs.base,
          targetDir,
          commitMessage: this.commitMessage ?? `deploy: ${key}`,
        })
      } else {
        this.logger.warn(
          'Deployment skipped. Set outDir option or enable includeCommitHash.',
        )
      }
    }

    const reportUrl = [
      `https://${info.owner}.github.io`,
      info.repo,
      targetDir,
    ]
      .filter(Boolean)
      .join('/') + '/'

    return Promise.resolve({ reportUrl })
  }

  fetch() {
    this.logger.warn(
      'This plugin is for `reg-suit publish` only. fetch() is not implemented.',
    )
    return Promise.resolve()
  }
}
