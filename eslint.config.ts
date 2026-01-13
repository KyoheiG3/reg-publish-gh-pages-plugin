import tseslint from 'typescript-eslint'

export default [
  { ignores: ['lib/', '**/node_modules/', '**/coverage/', '**/.reg/'] },
  ...tseslint.configs.recommended,
]
