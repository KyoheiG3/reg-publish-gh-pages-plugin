import type {
  PluginCreateOptions,
  PluginLogger,
  PublisherPlugin,
} from 'reg-suit-interface'
import { getRepoInfo } from './git-util'

interface PluginConfig {
  outDir?: string
  includeCommitHash?: boolean
}

export class GhPagesPublisherPlugin implements PublisherPlugin<PluginConfig> {
  private logger!: PluginLogger
  private outDir = ''
  private includeCommitHash = false

  init(config: PluginCreateOptions<PluginConfig>) {
    this.logger = config.logger
    this.outDir = config.options.outDir ?? ''
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

    const pathParts = [
      info.repo,
      this.outDir,
      this.includeCommitHash ? key : '',
    ]
      .filter(Boolean)
      .join('/')

    const reportUrl = `https://${info.owner}.github.io/${pathParts}/`

    return Promise.resolve({ reportUrl })
  }

  fetch() {
    this.logger.warn(
      'This plugin is for `reg-suit publish` only. fetch() is not implemented.',
    )
    return Promise.resolve()
  }
}
