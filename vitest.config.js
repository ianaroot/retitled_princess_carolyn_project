import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['app/javascript/editorV2/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['app/javascript/editorV2/**/*.js'],
      exclude: ['**/*.test.js', '**/node_modules/**']
    }
  },
  resolve: {
    alias: {
      'editorV2': '/app/javascript/editorV2'
    }
  }
});
