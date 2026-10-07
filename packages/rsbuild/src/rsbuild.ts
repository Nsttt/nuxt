import type { NuxtBuilder } from '@nuxt/schema'
import type { RsbuildInstance, Rspack } from '@rsbuild/core'
import { createRsbuild } from '@rsbuild/core'
import { logger, useNitro } from '@nuxt/kit'
import type { InputPluginOption } from 'rollup'

import { resolveRsbuildConfig } from './config.ts'
import { createHMRServer, setupDevServer } from './dev-server.ts'

export const bundle: NuxtBuilder['bundle'] = async (nuxt) => {
  const hmrServer = nuxt.options.dev ? await createHMRServer(nuxt) : undefined

  const config = await resolveRsbuildConfig(nuxt, { hmrServer })

  /** Remove Nitro rollup plugin for handling dynamic imports from rspack chunks */
  if (!nuxt.options.dev) {
    const nitro = useNitro()
    nitro.hooks.hook('rollup:before', (_nitro, config) => {
      const plugins = config.plugins as InputPluginOption[]

      const existingPlugin = plugins.findIndex(i => i && 'name' in i && i.name === 'dynamic-require')
      if (existingPlugin >= 0) {
        plugins.splice(existingPlugin, 1)
      }
    })
  }

  await nuxt.callHook('rsbuild:config', config)

  const rsbuild = await createRsbuild({
    cwd: nuxt.options.rootDir,
    callerName: 'nuxt',
    config,
  })

  if (hmrServer) {
    await setupDevServer(nuxt, rsbuild, hmrServer)
    return
  }

  await build(rsbuild)
}

async function build (rsbuild: RsbuildInstance) {
  const failedStats: Rspack.Stats[] = []
  rsbuild.onAfterEnvironmentCompile(({ stats }) => {
    if (stats?.hasErrors()) {
      failedStats.push(stats)
    }
  })

  try {
    const { close } = await rsbuild.build()
    await close()
  } catch (error) {
    const formatted = failedStats
      .map(stats => stats.toString({ errors: true, warnings: false, colors: false, errorDetails: true }))
      .join('\n\n')

    if (!formatted) {
      throw error
    }

    logger.error(formatted)
    const buildError = new Error('Nuxt build error', { cause: error })
    buildError.stack = formatted
    throw buildError
  }
}
