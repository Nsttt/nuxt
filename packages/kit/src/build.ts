import type { Configuration as WebpackConfig, WebpackPluginInstance } from 'webpack'
import type { RspackPluginInstance } from '@rspack/core'
import type { RsbuildConfig, RsbuildPlugin } from '@rsbuild/core'
import type { UserConfig as ViteConfig, Plugin as VitePlugin } from 'vite'
import { useNuxt } from './context.ts'
import { toArray } from './utils.ts'
import { resolveAlias } from './resolve.ts'
import { getUserCaller, warn } from './internal/trace.ts'

type Arrayable<T> = T | T[]
type Thenable<T> = T | Promise<T>

export interface ExtendConfigOptions {
  /**
   * Install plugin on dev
   * @default true
   */
  dev?: boolean
  /**
   * Install plugin on build
   * @default true
   */
  build?: boolean
  /**
   * Install plugin on server side
   * @default true
   */
  server?: boolean
  /**
   * Install plugin on client side
   * @default true
   */
  client?: boolean
  /**
   * Prepends the plugin to the array with `unshift()` instead of `push()`.
   */
  prepend?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ExtendWebpackConfigOptions extends ExtendConfigOptions {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ExtendRsbuildConfigOptions extends Omit<ExtendConfigOptions, 'server' | 'client' | 'prepend'> {}

export interface ExtendViteConfigOptions extends Omit<ExtendConfigOptions, 'server' | 'client'> {
  /**
   * Extend server Vite configuration
   * @default true
   * @deprecated calling \`extendViteConfig\` with only server/client environment is deprecated.
   * Nuxt 5+ uses the Vite Environment API which shares a configuration between environments.
   * You can likely use a Vite plugin to achieve the same result.
   */
  server?: boolean
  /**
   * Extend client Vite configuration
   * @default true
   * @deprecated calling \`extendViteConfig\` with only server/client environment is deprecated.
   * Nuxt 5+ uses the Vite Environment API which shares a configuration between environments.
   * You can likely use a Vite plugin to achieve the same result.
   */
  client?: boolean
}

const extendWebpackCompatibleConfig = (builder: 'rspack' | 'webpack') => (fn: ((config: WebpackConfig) => Thenable<void>), options: ExtendWebpackConfigOptions = {}) => {
  const nuxt = useNuxt()

  if (options.dev === false && nuxt.options.dev) {
    return
  }
  if (options.build === false && nuxt.options.build) {
    return
  }

  nuxt.hook(`${builder}:config`, async (configs) => {
    if (options.server !== false) {
      const config = configs.find(i => i.name === 'server')
      if (config) {
        await fn(config)
      }
    }
    if (options.client !== false) {
      const config = configs.find(i => i.name === 'client')
      if (config) {
        await fn(config)
      }
    }
  })
}

type ExtendWebpacklikeConfig = (fn: (config: WebpackConfig) => void, options?: ExtendWebpackConfigOptions) => void

/**
 * Extend webpack config
 *
 * The fallback function might be called multiple times
 * when applying to both client and server builds.
 */
export const extendWebpackConfig: ExtendWebpacklikeConfig = extendWebpackCompatibleConfig('webpack')
/**
 * Extend rspack config
 *
 * The fallback function might be called multiple times
 * when applying to both client and server builds.
 */
export const extendRspackConfig: ExtendWebpacklikeConfig = extendWebpackCompatibleConfig('rspack')

/**
 * Extend Rsbuild config
 *
 * The configuration contains a `client` and a `server` environment, which can be
 * configured individually with `config.environments`.
 */
export function extendRsbuildConfig (fn: ((config: RsbuildConfig) => Thenable<void>), options: ExtendRsbuildConfigOptions = {}): void {
  const nuxt = useNuxt()

  if (options.dev === false && nuxt.options.dev) {
    return
  }
  if (options.build === false && nuxt.options.build) {
    return
  }

  nuxt.hook('rsbuild:config', config => fn(config))
}

/**
 * Extend Vite config
 */
export function extendViteConfig (fn: ((config: ViteConfig) => Thenable<void>), options: ExtendViteConfigOptions = {}): (() => void) | undefined {
  const nuxt = useNuxt()

  if (options.dev === false && nuxt.options.dev) {
    return
  }
  if (options.build === false && nuxt.options.build) {
    return
  }

  // eslint-disable-next-line @typescript-eslint/no-deprecated
  if (options.server === false || options.client === false) {
    const caller = getUserCaller()
    const explanation = caller ? ` (used at \`${resolveAlias(caller.source)}:${caller.line}:${caller.column}\`)` : ''
    const warning = `[@nuxt/kit] calling \`extendViteConfig\` with only server/client environment is deprecated${explanation}. Nuxt 5+ will use the Vite Environment API which shares a configuration between environments. You can likely use a Vite plugin to achieve the same result.`
    warn(warning)
  }

  // Call fn() only once
  return nuxt.hook('vite:extend', ({ config }) => fn(config))
}

/**
 * Append webpack plugin to the config.
 */
export function addWebpackPlugin (pluginOrGetter: Arrayable<WebpackPluginInstance> | (() => Thenable<Arrayable<WebpackPluginInstance>>), options?: ExtendWebpackConfigOptions): void {
  extendWebpackConfig(async (config) => {
    const method: 'push' | 'unshift' = options?.prepend ? 'unshift' : 'push'
    const plugin = typeof pluginOrGetter === 'function' ? await pluginOrGetter() : pluginOrGetter

    config.plugins ||= []
    config.plugins[method](...toArray(plugin))
  }, options)
}
/**
 * Append rspack plugin to the config.
 */
export function addRspackPlugin (pluginOrGetter: Arrayable<RspackPluginInstance> | (() => Thenable<Arrayable<RspackPluginInstance>>), options?: ExtendWebpackConfigOptions): void {
  extendRspackConfig(async (config) => {
    const method: 'push' | 'unshift' = options?.prepend ? 'unshift' : 'push'
    const plugin = typeof pluginOrGetter === 'function' ? await pluginOrGetter() : pluginOrGetter

    config.plugins ||= []
    config.plugins[method](...toArray(plugin))
  }, options)
}

/**
 * Append Rsbuild plugin to the config.
 *
 * The plugin is registered for both the client and server environments,
 * unless `client: false` or `server: false` is passed.
 */
export function addRsbuildPlugin (pluginOrGetter: Arrayable<RsbuildPlugin> | (() => Thenable<Arrayable<RsbuildPlugin>>), options: ExtendConfigOptions = {}): void {
  if (options.server === false && options.client === false) {
    return
  }

  extendRsbuildConfig(async (config) => {
    const method: 'push' | 'unshift' = options.prepend ? 'unshift' : 'push'
    const plugins = toArray(typeof pluginOrGetter === 'function' ? await pluginOrGetter() : pluginOrGetter)

    if (options.server !== false && options.client !== false) {
      config.plugins ||= []
      config.plugins[method](...plugins)
      return
    }

    const environment = options.server === false ? 'client' : 'server'
    config.environments ||= {}
    const environmentConfig = config.environments[environment] ||= {}
    environmentConfig.plugins ||= []
    environmentConfig.plugins[method](...plugins)
  }, options)
}

/**
 * Append Vite plugin to the config.
 */
export function addVitePlugin (pluginOrGetter: Arrayable<VitePlugin> | (() => Thenable<Arrayable<VitePlugin>>), options: ExtendConfigOptions = {}): void {
  const nuxt = useNuxt()

  if (options.dev === false && nuxt.options.dev) {
    return
  }
  if (options.build === false && nuxt.options.build) {
    return
  }

  let needsEnvInjection = false
  nuxt.hook('vite:extend', async ({ config }) => {
    config.plugins ||= []

    const plugin = toArray(typeof pluginOrGetter === 'function' ? await pluginOrGetter() : pluginOrGetter)
    if (options.server !== false && options.client !== false) {
      const method: 'push' | 'unshift' = options?.prepend ? 'unshift' : 'push'
      config.plugins[method](...plugin)
      return
    }

    if (!config.environments?.ssr || !config.environments.client) {
      needsEnvInjection = true
      return
    }

    const environmentName = options.server === false ? 'client' : 'ssr'
    const pluginName = plugin.map(p => p.name).join('|')
    config.plugins.push({
      name: `${pluginName}:wrapper`,
      enforce: options?.prepend ? 'pre' : 'post',
      applyToEnvironment (environment) {
        if (environment.name === environmentName) {
          return plugin
        }
      },
    })
  })

  nuxt.hook('vite:extendConfig', async (config, env) => {
    if (!needsEnvInjection) {
      return
    }
    const plugin = toArray(typeof pluginOrGetter === 'function' ? await pluginOrGetter() : pluginOrGetter)
    const method: 'push' | 'unshift' = options?.prepend ? 'unshift' : 'push'
    if (env.isClient && options.server === false) {
      config.plugins![method](...plugin)
    }
    if (env.isServer && options.client === false) {
      config.plugins![method](...plugin)
    }
  })
}

interface AddBuildPluginFactory {
  vite?: () => Thenable<Arrayable<VitePlugin>>
  webpack?: () => Thenable<Arrayable<WebpackPluginInstance>>
  rsbuild?: () => Thenable<Arrayable<RsbuildPlugin>>
  rspack?: () => Thenable<Arrayable<RspackPluginInstance>>
}

export function addBuildPlugin (pluginFactory: AddBuildPluginFactory, options?: ExtendConfigOptions): void {
  if (pluginFactory.vite) {
    addVitePlugin(pluginFactory.vite, options)
  }

  if (pluginFactory.webpack) {
    addWebpackPlugin(pluginFactory.webpack, options)
  }

  if (pluginFactory.rsbuild) {
    addRsbuildPlugin(pluginFactory.rsbuild, options)
  }

  // the Rsbuild builder also applies Rspack plugins, unless an Rsbuild plugin is provided
  if (pluginFactory.rspack && !(pluginFactory.rsbuild && useNuxt().options.builder === '@nuxt/rsbuild-builder')) {
    addRspackPlugin(pluginFactory.rspack, options)
  }
}
