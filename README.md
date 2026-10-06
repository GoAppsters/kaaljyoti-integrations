# kaaljyoti-integrations

Client shells over the [Kaal Jyoti API](https://kaaljyoti.com/api): the widget bundle, the SDKs and the platform plugins. Nothing here calculates anything; every package is a thin, typed client over `https://api.kaaljyoti.com/v1`.

| Package                                  | Where                                     | Status    |
| ---------------------------------------- | ----------------------------------------- | --------- |
| [`@kaaljyoti/widgets`](packages/widgets) | `cdn.kaaljyoti.com/widgets/v1.js`, npm    | CDN 0.2.0 |
| `@kaaljyoti/sdk` (TypeScript)            | npm                                       | 0.1.0     |
| `kaaljyoti` (Dart)                       | pub.dev                                   | 0.1.0     |
| `kaaljyoti/sdk` (PHP)                    | Packagist, via the `kaaljyoti-php` mirror | 0.1.0     |
| `kaaljyoti` (Python)                     | PyPI                                      | 0.1.0     |
| WordPress                                | `plugins/wordpress`, WordPress.org        | in review |

## Working on it

```bash
pnpm install
pnpm test          # TypeScript unit tests, recorded fixtures
pnpm gen:check     # generated code matches openapi/openapi.json
pnpm build         # every package
pnpm serve         # examples on http://localhost:3000
cd packages/sdk-dart && dart test   # the Dart package
cd packages/sdk-php && composer test # the PHP package
cd plugins/wordpress && composer test # the WordPress plugin (pnpm build first)
cd packages/sdk-python && .venv/bin/pytest # the Python package (python -m venv .venv && pip install -e '.[dev]' once)
```

Design notes live in [`docs/`](docs/). Licence: MIT.

## Releasing

Each package releases on its own tag; see [RELEASING.md](RELEASING.md).
