// Flat config, deliberately small: TypeScript recommended rules plus the two
// house rules kaaljyoti-api uses.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      // Composer's install tree. CI lints before `composer install`, so it
      // never sees one, but a developer who has run the PHP tests has a
      // `vendor/` full of third-party JavaScript that is none of our business.
      '**/vendor/**',
      '**/test/fixtures/**',
      'examples/**',
      // The widget bundle copied into the WordPress plugin by its build:
      // generated, gitignored, and already linted where it is written.
      'plugins/wordpress/kaaljyoti/assets/widgets/**',
      // …with its source and build, copied in beside it for WordPress.org.
      'plugins/wordpress/kaaljyoti/widgets-src/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // Config and build scripts belong to no package's tsconfig, so the
          // project service needs to be told they are lintable at all.
          allowDefaultProject: [
            'eslint.config.js',
            'vitest.config.ts',
            'scripts/*.mjs',
            'packages/*/scripts/*.mjs',
            // The Dart package keeps its generator in `tool/`, where `dart`
            // itself looks for developer scripts.
            'packages/*/tool/*.mjs',
            // The WordPress plugin's build script, in the same place, and
            // the one small script that plugin ships to the browser.
            'plugins/*/tool/*.mjs',
            'plugins/wordpress/kaaljyoti/assets/*.js',
            // …and the block editor scripts, one per block directory (22).
            'plugins/wordpress/kaaljyoti/blocks/*/*.js',
          ],
          // The default cap is eight, and the Dart generator is the ninth
          // such file; the Python generator made seventeen, and a block per
          // widget (stage 3 of the revamp) about forty. These are small
          // scripts linted once in CI, not a hot path worth splitting into a
          // tsconfig of their own.
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 64,
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // The WordPress plugin ships one small script to the browser, on the
    // globals a page has rather than on anything bundled.
    files: ['plugins/wordpress/kaaljyoti/assets/*.js'],
    languageOptions: {
      globals: {
        document: 'readonly',
        fetch: 'readonly',
        URLSearchParams: 'readonly',
        window: 'readonly',
      },
    },
  },
  {
    // The block editor scripts, on the globals the editor page has: `window`
    // and the `wp.*` namespaces hanging off it. No JSX, no build step.
    files: ['plugins/wordpress/kaaljyoti/blocks/**/*.js'],
    languageOptions: {
      globals: { window: 'readonly', wp: 'readonly' },
    },
  },
  {
    // The `.mjs` build and serve scripts run under Node, where `console`,
    // `process` and `fetch` are globals; `no-undef` knows nothing about that
    // on its own (it is off for `.ts`, which gets the same facts from the
    // type checker).
    files: ['**/*.mjs'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly', fetch: 'readonly' },
    },
  },
);
