import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    rules: {
      // Relax rules that conflict with our patterns
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off', // We use ! for DOM queries intentionally
      '@typescript-eslint/no-explicit-any': 'error', // Enforce zero-any
      'no-console': ['warn', { allow: ['error', 'warn'] }],
      'prefer-const': 'error',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'src-tauri/', 'e2e/', '*.config.*'],
  }
);
