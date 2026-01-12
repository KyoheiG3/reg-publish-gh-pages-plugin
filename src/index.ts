import type { PublisherPluginFactory } from 'reg-suit-interface'
import { GhPagesPublisherPlugin } from './publisher.js'

const factory: PublisherPluginFactory = () => {
  return {
    publisher: new GhPagesPublisherPlugin(),
  }
}

export = factory
