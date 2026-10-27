# @devopsrockstars/frontend

The DevOpsRockstars React site served at <https://devopsrockstars.com>: Home's
interactive 3D skyline, the Company contact page, the store, and the lazily
loaded `/admin`. It holds the static assets, the Bun build and development
server in `tooling/`, and the WebdriverIO browser tests in `e2e/`.

## Skyline

The interactive 3D skyline comes from the exact-pinned
[`@a2f0/skyline`](https://www.npmjs.com/package/@a2f0/skyline) npm package,
which ships built JavaScript and its own viewer assets, so installs run no
build step and need no sibling checkout.

## Development

Run these from the repository root, whose scripts wrap this package's:

```shell
bun run start-server           # http://localhost:8080
bun run start-test-server      # http://localhost:8081, production feature set
bun run start-staging-server   # http://localhost:8082, staging feature set
bun run build                  # production Bun build
```

The development server rebuilds on source edits; refresh the browser to load
the updated bundle. It proxies `/api` to the store Worker on
`http://127.0.0.1:8787`; the
[backend README](../backend/README.md#local-development) starts it.
[Development](../../docs/development.md#testing) covers the browser test
runners and their fixed flag profiles.

The store's hat preview documents its artwork and model proportions in
[`static/image/store`](static/image/store/README.md).
