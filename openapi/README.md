# The OpenAPI snapshot

`openapi.json` is the gateway's own document, fetched from staging and
committed. Every generator in this repository reads this file and nothing
else, so the SDKs cannot drift from each other, and a diff of this file is the
list of API changes a release has to absorb.

Refresh it with `node scripts/refresh-openapi.mjs` (staging by default;
`--prod` for production; `--file <path>` for a gateway build on disk that is
not deployed yet), then run `pnpm gen` and look at what changed.

The refresh drops the recorded 200 response examples: the API reference shows
them, no generator reads them, and they would more than double this file and
its diffs. Request examples are kept.
