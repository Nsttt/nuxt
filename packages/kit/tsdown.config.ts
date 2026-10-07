import { defineConfig } from 'tsdown'

export default defineConfig({
  dts: { oxc: true },
  exports: { devExports: true },
  deps: {
    onlyBundle: [],
    neverBundle: [
      '@rsbuild/core',
      '@rspack/core',
      '@nuxt/schema',
      'nitro/types',
      'nitropack/types',
      'webpack',
      'vite',
      'unimport',
      /^nuxt(\/|$)/,
      /^#build\//,
      /^#internal\//,
    ],
  },
})
