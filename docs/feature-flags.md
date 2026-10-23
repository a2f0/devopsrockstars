# Feature flags

[feature-flags.json](../feature-flags.json) is the versioned rollout configuration.
Every flag has an explicit boolean value for each environment. Run `bun run flags`
to see the current values; this file is the source of truth for rollout state.

| Flag | Controls |
| --- | --- |
| `store` | Store navigation, routes, inventory prefetch, and hat preparation |
| `search` | Search navigation and route |

```shell
bun run flags          # Show the matrix and descriptions
bun run flags --json   # Print the validated configuration as JSON
bun run flags:check    # Validate without building or deploying
```

To release or disable a feature, change only its boolean in the target
environment's row in `feature-flags.json`, review the change, and redeploy that
environment through the normal shipping workflow. For example, a later store
release would change `production.store` to `true`, leaving search alone.

Keep each flag independent; never derive a flag's value from whether the
environment is staging. Disabling the store removes its links and routes, but
its implementation JavaScript can still be present in the bundle.

The build validates the complete matrix and embeds only the selected
environment's values in the browser bundle. Missing flags or environments,
unknown names, and non-boolean values fail the build and pre-commit checks.
There are no browser, query-string, local-storage, or shell overrides. A running
dev server rebuilds when the configuration changes; refresh the page afterward.
Deployed values change only after rebuilding and deploying.

Each build publishes `/feature-flags.json` containing its `environment` and
resolved `flags`, so deployment checks can inspect the active configuration.
This is a read-only build artifact. Search-engine indexing is separate:
production remains indexable and staging remains `noindex`, regardless of flags.
The store flag governs the frontend; the store API's deployment is separate.
`packages/frontend/buildAssets.ts` generates each page's metadata, `robots.txt`,
`sitemap.xml`, and `_headers`, all covered by unit and browser tests; see
[search engines](deployment.md#search-engines).

To add a flag, register its description in
`packages/frontend/src/featureFlags.ts`, add boolean values for both environments
in the matrix, gate the relevant UI, build assets, and pages in
`packages/frontend/src/pages.ts` with that flag, and cover the enabled and
disabled behavior in tests.
