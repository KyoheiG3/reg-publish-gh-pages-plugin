import type { PublisherPluginFactory } from 'reg-suit-interface'
import { GhPagesPublisherPlugin } from './publisher.js'
import { GhPagesPreparerPlugin } from './preparer.js'

const factory: PublisherPluginFactory = () => {
  return {
    preparer: new GhPagesPreparerPlugin(),
    publisher: new GhPagesPublisherPlugin(),
  }
}

export = factory
