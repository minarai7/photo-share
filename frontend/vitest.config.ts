import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['./src/test/setup.ts'],
      // Fixed API base so assertions don't depend on frontend/.env.
      env: { VITE_API_BASE_URL: 'http://api.test' },
      restoreMocks: true,
      unstubGlobals: true,
    },
  }),
)
