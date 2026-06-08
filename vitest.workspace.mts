/// <reference types="vitest" />

import { defineConfig, defineWorkspace } from 'vitest/config'

import swc from 'unplugin-swc'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineWorkspace([
  defineConfig({
    plugins: [swc.vite(), tsconfigPaths()],
    test: {
      name: 'unit',
      include: ['**/*.test.ts'],
      globals: true,
      environment: 'node',
      alias: {
        '@/': new URL('./src/', import.meta.url).pathname
      },
      root: './',
      testTimeout: 10_000,
      hookTimeout: 10_000,
      poolOptions: {
        threads: {
          singleThread: true
        }
      }
    }
  }),
])
