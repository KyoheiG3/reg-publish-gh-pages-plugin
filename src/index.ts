import type { PublisherPluginFactory } from 'reg-suit-interface'
import { GhPagesPreparerPlugin } from './preparer.js'
import { GhPagesPublisherPlugin } from './publisher.js'

const factory: PublisherPluginFactory = () => {
  return {
    preparer: new GhPagesPreparerPlugin(),
    publisher: new GhPagesPublisherPlugin(),
  }
}

export = factory
