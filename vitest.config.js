import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['app/javascript/editor/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['app/javascript/editor/**/*.js'],
      exclude: ['**/*.test.js', '**/node_modules/**']
    }
  },
  resolve: {
    alias: {
      'editor': '/app/javascript/editor'
    }
  }
});
