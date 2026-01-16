import simpleImportSort from 'eslint-plugin-simple-import-sort'
import tseslint from 'typescript-eslint'

export default [
  { ignores: ['lib/', '**/node_modules/', '**/coverage/', '**/.reg/'] },
  ...tseslint.configs.recommended,
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'simple-import-sort/imports': ['warn', {
        groups: [['^\\u0000', '^@?\\w', '^', '^\\.']],
      }],
      'simple-import-sort/exports': 'warn',
    },
  },
]
