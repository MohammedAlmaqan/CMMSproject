import tseslint from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['dist/**'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      // R.9 D3-cleanup-errors (tracker v1.1-7): a teardown that cannot finish
      // must fail the test loudly rather than leave evidence behind quietly.
      // An empty catch handler is a swallowed error, whether or not it binds a
      // parameter. Scoped to tests; production `src` keeps its adjudicated
      // parse-fallback catches.
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='catch'] > ArrowFunctionExpression[body.body.length=0]",
          message:
            'Teardown must fail loudly: do not swallow errors with an empty .catch. Remove it and let the error surface (see R.9 D3-cleanup-errors).',
        },
      ],
    },
  },
];