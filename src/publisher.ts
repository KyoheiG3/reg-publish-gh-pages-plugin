import type { PluginCreateOptions, PublisherPlugin } from 'reg-suit-interface'

interface PluginConfig {
  reportUrl?: string
}

export class GhPagesPublisherPlugin implements PublisherPlugin<PluginConfig> {
  private reportUrl = ''

  init(config: PluginCreateOptions<PluginConfig>) {
    this.reportUrl = config.options.reportUrl ?? ''
  }

  publish() {
    if (!this.reportUrl) {
      console.warn(
        'reg-publish-gh-pages-plugin: reportUrl is not set. reportUrl will be empty.',
      )
    }

    return Promise.resolve({ reportUrl: this.reportUrl })
  }

  fetch() {
    console.log(
      'reg-publish-gh-pages-plugin: This plugin is for `reg-suit publish` only. fetch() is not implemented.',
    )
    return Promise.resolve()
  }
}
