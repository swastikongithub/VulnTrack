import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: './tests/support/globalSetup.js',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
})
