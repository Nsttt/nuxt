import type { Nuxt, NuxtOptions } from '@nuxt/schema'
import type { PostCSSPlugin } from '@rsbuild/core'
import { createJiti } from 'jiti'
import { ensureDependencyInstalled, logger } from '@nuxt/kit'

type PostcssPluginFactory = (options: Record<string, any>) => PostCSSPlugin

function sortPlugins ({ plugins, order }: NuxtOptions['postcss']): string[] {
  const names = Object.keys(plugins)
  return typeof order === 'function' ? order(names) : (order || names)
}

/**
 * Resolve the PostCSS plugins configured with the `postcss` option.
 *
 * Vendor prefixing and minification are handled by Lightning CSS in Rsbuild,
 * so no plugins are added by default.
 */
export async function resolvePostcssPlugins (nuxt: Nuxt): Promise<PostCSSPlugin[]> {
  const plugins: PostCSSPlugin[] = []
  const jiti = createJiti(nuxt.options.rootDir, { alias: nuxt.options.alias })

  for (const pluginName of sortPlugins(nuxt.options.postcss)) {
    const pluginOptions = nuxt.options.postcss.plugins[pluginName]
    if (!pluginOptions) { continue }

    const pluginFn = await resolvePostcssPlugin(jiti, pluginName, nuxt)
    if (typeof pluginFn === 'function') {
      plugins.push(pluginFn(pluginOptions))
    }
  }

  return plugins
}

async function importPostcssPlugin (jiti: ReturnType<typeof createJiti>, pluginName: string, nuxt: Nuxt): Promise<PostcssPluginFactory | undefined> {
  for (const parentURL of nuxt.options.modulesDir) {
    const pluginFn = await jiti.import(pluginName, { parentURL: parentURL.replace(/\/node_modules\/?$/, ''), try: true, default: true }) as PostcssPluginFactory
    if (typeof pluginFn === 'function') {
      return pluginFn
    }
  }
}

async function resolvePostcssPlugin (jiti: ReturnType<typeof createJiti>, pluginName: string, nuxt: Nuxt): Promise<PostcssPluginFactory | undefined> {
  const pluginFn = await importPostcssPlugin(jiti, pluginName, nuxt)
  if (pluginFn) {
    return pluginFn
  }

  // Plugin not found - prompt the user to install it
  const installed = await ensureDependencyInstalled(pluginName, {
    rootDir: nuxt.options.rootDir,
    searchPaths: nuxt.options.modulesDir,
    from: import.meta.url,
  })

  if (installed) {
    const installedPluginFn = await importPostcssPlugin(jiti, pluginName, nuxt)
    if (installedPluginFn) {
      return installedPluginFn
    }
  }

  logger.warn(`Could not load postcss plugin \`${pluginName}\`.`)
}
