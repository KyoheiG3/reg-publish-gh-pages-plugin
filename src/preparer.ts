import type {
  PluginCreateOptions,
  PluginPreparer,
  PreparerQuestions,
} from 'reg-suit-interface'
import { type PluginConfig } from './publisher'

interface PreparerConfig {
  branch?: string
  outDir?: string
}

export class GhPagesPreparerPlugin
  implements PluginPreparer<PreparerConfig, PluginConfig>
{
  inquire(): PreparerQuestions {
    return [
      {
        name: 'branch',
        type: 'input',
        message:
          'Branch name to deploy (leave empty to only generate reportUrl without deploying)',
      },
      {
        name: 'outDir',
        type: 'input',
        message: 'Output directory on the branch',
      },
    ]
  }

  prepare(config: PluginCreateOptions<PreparerConfig>): Promise<PluginConfig> {
    const { branch, outDir } = config.options

    return Promise.resolve({
      ...(branch && { branch }),
      ...(outDir && { outDir }),
    })
  }
}
