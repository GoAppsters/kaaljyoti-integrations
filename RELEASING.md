# Releasing

This repository is public, and what it publishes runs on other people's
sites. Pushing to `main` reaches nobody; a **release tag** does. This file is
how a tag gets made.

## What reaches users, and when

Each package releases on its own tag. A fix to one package is never a release
of the others.

| Package                         | Tag                     | What the tag does                                                                                                   | Who sees it                                        |
| ------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `@kaaljyoti/widgets`            | `widgets-v<version>`    | `release-widgets.yml`: npm, then `cdn.kaaljyoti.com` — the chunks, the pinned `v<version>.js`, `v1.js` last         | **Every site using `v1.js`, at once**              |
| WordPress plugin `kaal-jyoti`   | `wordpress-v<version>`  | `deploy-wordpress.yml`: builds the plugin and uploads it to WordPress.org SVN                                       | Every WordPress site with the plugin, as an update |
| Python SDK `kaaljyoti`          | `sdk-python-v<version>` | `publish-python.yml`: tests, builds and publishes to PyPI                                                           | New installs and upgrades                          |
| PHP SDK `kaaljyoti/sdk`         | `sdk-php-v<version>`    | `mirror-php.yml`: splits `packages/sdk-php` to the `kaaljyoti-php` mirror with tag `v<version>`; Packagist reads it | New installs and upgrades                          |
| TypeScript SDK `@kaaljyoti/sdk` | `sdk-ts-v<version>`     | `publish-ts.yml`: tests, builds and publishes to npm                                                                | New installs and upgrades                          |
| Dart SDK `kaaljyoti`            | `sdk-dart-v<version>`   | `publish-dart.yml`: tests and publishes to pub.dev (automated publishing; the first version goes up by hand)        | New installs and upgrades                          |

Each workflow checks that the tag matches the package's version, and skips
the publishing step until that destination's secret or variable exists, so
an early tag only proves the build.

## First releases

npm and pub.dev only trust a workflow for a package that already exists, so
the first version of `@kaaljyoti/sdk`, `@kaaljyoti/widgets` and the Dart
`kaaljyoti` is published by hand, from a clean checkout of the release tag,
by the owner. Every later version goes through its workflow. PyPI can trust a
workflow before the project exists (a "pending publisher"), and Packagist
reads the mirror, so the Python and PHP SDKs use their workflows from the
start.

## The rules

1. **`main` is always releasable.** Work happens on a local branch and is
   merged to `main` only with the owner's go-ahead, after the full checks
   pass. Only `main` and release tags are pushed; no other branch is.
2. **The owner decides every release.** A tag is created only on the
   owner's explicit word, naming the package and the version.
3. **A published version never changes.** npm, PyPI, Packagist, pub.dev and
   WordPress.org versions, and the CDN's `v<version>.js`, are immutable. A
   fix is a new version.
4. **No force pushes and no history rewrites** on `main` or on a tag.
5. **Nothing secret in the repository**, in any commit: no live or test keys,
   tokens, passwords or private keys. Examples use placeholders
   (`kj_pub_your_key`, `kj_test_…`). Secrets live in GitHub's repository
   secrets and nowhere else.

## Versions

[Semantic versioning](https://semver.org): before 1.0, a minor bump
(`0.2.0`) may change behaviour, a patch (`0.1.1`) only fixes.

Where each version lives — change all of a package's places in one commit:

| Package                         | Set the version in                                                                              | Then                                                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Widgets                         | `packages/widgets/package.json`                                                                 | the build stamps it into the bundle                                                                          |
| WordPress                       | `kaal-jyoti.php` (the `Version:` header and `KAAL_JYOTI_VERSION`), `readme.txt` (`Stable tag:`) | add the version to `readme.txt`'s changelog                                                                  |
| TypeScript SDK `@kaaljyoti/sdk` | `sdk-ts-v<version>`                                                                             | `publish-ts.yml`: tests, builds and publishes to npm                                                         | New installs and upgrades |
| Python SDK                      | `packages/sdk-python/pyproject.toml`                                                            | `pnpm gen`                                                                                                   |
| PHP SDK                         | `packages/sdk-php/package.json`                                                                 | `pnpm gen` (writes `Generated/Version.php`)                                                                  |
| Dart SDK `kaaljyoti`            | `sdk-dart-v<version>`                                                                           | `publish-dart.yml`: tests and publishes to pub.dev (automated publishing; the first version goes up by hand) | New installs and upgrades |

Every package with a `CHANGELOG.md` gets an entry for the version: what
changed for someone using it, not the commit list.

## Release checklist

For a release of one package:

1. On a branch: bump the version (above), write the changelog entry.
2. If the API changed since the last release, refresh the OpenAPI snapshot
   from production (`node scripts/refresh-openapi.mjs --prod`), run
   `pnpm gen`, and read the diff.
3. Run the full checks — what CI runs:
   `pnpm lint`, `pnpm gen:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`,
   the widgets' size budget, and the Dart, PHP, Python and WordPress steps of
   `.github/workflows/ci.yml`.
4. Run the package's live smoke test against staging with a staging test
   key (`KJ_SMOKE=1 KJ_API_KEY=…`; see each package's README).
5. For the widgets: try the build on the WordPress QA site and a plain HTML
   page before it goes to the CDN — `v1.js` changes every customer's site at
   once.
6. Owner's go-ahead → merge the branch to `main`, push `main`, and wait for
   CI to pass on `main`.
7. Owner's word to release → tag the merge commit and push the tag:

   ```sh
   git tag -a sdk-python-v0.1.1 -m "Python SDK 0.1.1"
   git push origin sdk-python-v0.1.1
   ```

   Push **at most three tags in one push**: GitHub starts no workflow for
   the tags of a push that carries more than three. Push them one by one.

8. Approve the run in the `release` environment (below), and watch it
   finish.
9. Check the result where users get it: install the package from its
   registry in a clean directory, or load the CDN file, or update the plugin
   on the QA site.

## When a release is wrong

Do not delete or move the tag, and do not re-publish over the version.

- **An SDK:** release the fix as the next patch version. On npm, deprecate
  the bad version (`npm deprecate`); on PyPI, yank it; on pub.dev, retract
  it; on Packagist, release the patch.
- **The widgets:** re-point `v1.js` at the last good version at once
  (re-run the CDN publish from that version's tag), then release the fix as
  a new version. The pinned `v<version>.js` files stay as they are.
- **WordPress:** release the fix as the next version; WordPress.org offers it
  as an update.

## Repository protection (GitHub settings)

- **`main`** — a branch ruleset: no force pushes, no deletion. CI runs on
  every push to `main`; a release is tagged only on a commit whose CI passed
  (requiring it in the ruleset would refuse the push itself, since `main` is
  merged locally).
- **Release tags** (`*-v*`) — two tag rulesets: only an admin may create
  one, and nobody may move or delete one.
- **The `kaaljyoti-php` mirror** — `main` cannot be deleted, and its version
  tags (`v*`) cannot be moved or deleted. Its `main` takes force pushes: the
  first mirror push replaces the repository's initial commit.
- **A `release` environment** with the owner as required reviewer, open to
  release tags (`*-v*`) only. Every publishing job runs in it, so a pushed
  tag waits for the owner's approval before anything is published.
- **Secrets** (repository secrets, scoped to the `release` environment):
  `CLOUDFLARE_API_TOKEN` (R2 edit on `kaaljyoti-cdn` only),
  `SVN_USERNAME` / `SVN_PASSWORD` (the WordPress.org `goappsters` account),
  `PHP_MIRROR_DEPLOY_KEY` (a write deploy key on `kaaljyoti-php`), and the
  repository variable `PYPI_PUBLISH=yes` once PyPI trusted publishing is set
  up, and `NPM_TRUSTED_PUBLISHING=yes` once npm trusts the workflows. npm,
  PyPI and pub.dev need no stored secret: each trusts the publishing
  workflow's run in the `release` environment.
