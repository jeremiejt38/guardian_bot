const js = require('@eslint/js');

module.exports = [
  {
    ignores: ['node_modules/**', 'dist/**', 'data/**', 'coverage/**']
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: {
        console: 'readonly',
        process: 'readonly',
        require: 'readonly',
        module: 'writable',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        fetch: 'readonly',
        AbortSignal: 'readonly',
        AbortController: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_|error|err' }],
      'no-undef': 'error',
      'no-constant-condition': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-async-promise-executor': 'warn',
      'no-await-in-loop': 'off',
      'no-console': 'off',
      'no-prototype-builtins': 'warn',
      'no-useless-escape': 'warn',
      'no-control-regex': 'warn',
      'no-case-declarations': 'warn',
      'no-fallthrough': 'warn',
      'no-global-assign': 'error',
      'no-redeclare': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-invalid-regexp': 'error',
      'getter-return': 'warn',
      'valid-typeof': 'error',
      'no-cond-assign': 'warn'
    }
  }
];
