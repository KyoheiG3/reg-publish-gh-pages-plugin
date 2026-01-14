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
  reportPath?: string
  artifactDeploy?: boolean
}

export class GhPagesPublisherPlugin implements PublisherPlugin<PluginConfig> {
  private logger!: PluginLogger
  private workingDirs!: WorkingDirectoryInfo
  private branch?: string
  private outDir!: string
  private sourceDir?: string
  private commitMessage?: string
  private includeCommitHash!: boolean
  private reportPath?: string
  private artifactDeploy!: boolean

  init(config: PluginCreateOptions<PluginConfig>) {
    this.logger = config.logger
    this.workingDirs = config.workingDirs
    this.branch = config.options.branch
    this.outDir = config.options.outDir ?? ''
    this.sourceDir = config.options.sourceDir
    this.commitMessage = config.options.commitMessage
    this.includeCommitHash = config.options.includeCommitHash ?? false
    this.reportPath = config.options.reportPath
    this.artifactDeploy = config.options.artifactDeploy ?? false
  }

  async publish(key: string) {
    const info = getRepoInfo()

    if (!info) {
      this.logger.warn(
        'Unable to determine repository info. Make sure to run this in a GitHub repository or set GITHUB_REPOSITORY environment variable.',
      )
      return { reportUrl: undefined }
    }

    const targetDir = [
      this.outDir,
      this.includeCommitHash ? key : '',
    ]
      .filter(Boolean)
      .join('/')

    if (this.branch) {
      if (targetDir) {
        await deployToGitHubPages({
          branch: this.branch,
          sourceDir: this.sourceDir ?? this.workingDirs.base,
          targetDir,
          commitMessage: this.commitMessage ?? `deploy: ${key}`,
          artifactDeploy: this.artifactDeploy,
          repoInfo: info,
        })
      } else {
        this.logger.warn(
          'Deployment skipped. Set outDir option or enable includeCommitHash.',
        )
      }
    }

    return { reportUrl: this.buildReportUrl(info, targetDir) }
  }

  fetch() {
    this.logger.warn(
      'This plugin is for `reg-suit publish` only. fetch() is not implemented.',
    )
    return Promise.resolve()
  }

  private buildReportUrl(
    info: { owner: string; repo: string },
    targetDir: string,
  ): string {
    const url = this.reportPath?.startsWith('http')
      ? this.reportPath
      : [
        `https://${info.owner}.github.io`,
        info.repo,
        this.reportPath ?? targetDir,
      ]
        .filter(Boolean)
        .join('/')

    return url.replace(/\/?$/, '/')
  }
}
