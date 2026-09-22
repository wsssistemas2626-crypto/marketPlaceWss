import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * Regras comuns a todo o repositório (CLAUDE.md §9: nada de `any`).
 * As regras de fronteira entre módulos entram na US-002.
 */
export const baseConfig = tseslint.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/coverage/**', '**/node_modules/**', '**/*.tsbuildinfo'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'Leia configuração pelo ConfigService, não por process.env espalhado.' },
      ],
      eqeqeq: ['error', 'always'],
    },
  },
  prettier,
);

export default baseConfig;
