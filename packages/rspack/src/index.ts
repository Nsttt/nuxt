import type { NuxtBuilder } from '@nuxt/schema'
import { logger } from '@nuxt/kit'

import { bundle as bundleWithRspack } from '../../webpack/src/index.ts'

/**
 * @deprecated `@nuxt/rspack-builder` is deprecated in favour of `@nuxt/rsbuild-builder`.
 */
export const bundle: NuxtBuilder['bundle'] = (nuxt) => {
  logger.warn('`@nuxt/rspack-builder` is deprecated and will be removed in a future major version of Nuxt. Use `@nuxt/rsbuild-builder` instead by setting `builder: \'rsbuild\'` in your Nuxt config. You can read more at `https://nuxt.com/docs/4.x/api/nuxt-config#builder`.')
  return bundleWithRspack(nuxt)
}
