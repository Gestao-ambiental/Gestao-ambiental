import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig(
  globalIgnores(['**/dist', '**/coverage', 'supabase/**']),

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  // Front: React, hooks e acessibilidade
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.strict,
    ],
    languageOptions: { globals: globals.browser },
  },

  // Domínio: TypeScript puro, sem React, Supabase, rede, DOM ou relógio (ADR-0007)
  {
    files: ['packages/domain/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*'],
              message: 'O domínio não depende de React.',
            },
            { group: ['@supabase/*'], message: 'O domínio não depende de Supabase.' },
            { group: ['node:*'], message: 'O domínio não depende de APIs do Node.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'O domínio não faz rede.' },
        { name: 'XMLHttpRequest', message: 'O domínio não faz rede.' },
        { name: 'window', message: 'O domínio não acessa o navegador.' },
        { name: 'document', message: 'O domínio não acessa o navegador.' },
        { name: 'localStorage', message: 'O domínio não acessa o navegador.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'Receba "hoje" ou o instante como argumento.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Receba "hoje" ou o instante como argumento.',
        },
      ],
    },
  },

  prettier,
)
