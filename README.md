# DevOpsRockstars

[devopsrockstars.com](https://devopsrockstars.com)

React website and Cloudflare store backend for DevOpsRockstars.

Use Bun **1.4.3** (see `.mise.toml`) for all workspace commands. TypeScript
**7.0.2** checks types; Bun transpiles and bundles the application. Install
[mise](https://mise.jdx.dev), then run `mise install` and `bun install` from a
shell with mise activated. CI uses the same Bun pin. Commit `bun.lock` with
dependency changes. Development rebuilds on source edits; refresh the browser
to load the updated bundle.

The interactive 3D skyline comes from the exact-pinned
[`@a2f0/skyline`](https://www.npmjs.com/package/@a2f0/skyline) npm package,
which ships built JavaScript and its own viewer assets, so installs run no
build step and need no sibling checkout.

## Workspace layout

- `packages/frontend` — React site, static assets, Bun build scripts, and
  browser tests
- `packages/backend` — Cloudflare Worker, D1 migrations, and Wrangler
  configuration
- `packages/shared-types` — API types shared by the frontend and backend

Root scripts orchestrate the packages, so the existing development, test, and
deployment commands remain stable.

Agent workflow and validation guidance live in [AGENTS.md](AGENTS.md). See
[dependency maintenance](docs/dependency-maintenance.md) for upgrade procedures,
active constraints, and security override removal conditions.

## Development

```shell
mise install
pip install pre-commit==4.7.0
pre-commit install
bun install
bun run start-server
```

The site and the store API are separate Workers, so local development runs
them side by side. Start the store Worker on port 8787 and the Bun server
proxies `/api` to it, keeping development same-origin. The local Worker
command allows the frontend origins on ports 8080, 8081, and 8082 for both
`localhost` and `127.0.0.1`; deployed Workers retain their domain-only origin
configuration:

```shell
cp packages/backend/.dev.vars.example packages/backend/.dev.vars
bun run db:migrate:local
bun run dev:cloudflare   # store Worker on :8787
bun run start-server     # site on :8080, proxying /api to :8787
```

The local store is deliberately sold out after the first migration. Add local
inventory in the admin, or directly, before testing checkout:

```shell
bun run --cwd packages/backend --bun wrangler d1 execute \
  devopsrockstars-store-staging --env staging --local \
  --command "UPDATE product_variants SET inventory_quantity = 5"
```

## Store admin

`/admin` manages inventory, prices, and listings, shows orders, and resolves
Stripe alerts. It signs in with the same Better Auth setup as
[ct](https://github.com/a2f0/ct): registration is closed, so an operator
provisions each account from the command line. For local development, set
`BETTER_AUTH_SECRET` in `packages/backend/.dev.vars` (copied above), then:

```shell
bun run admin:user create --local --email admin@example.test
```

The command prompts for a 12–128 character password without echoing it. See
[deployment operations](docs/deployment.md#store-admin) for deployed accounts.

To preview the committed staging flag configuration:

```shell
bun run start-staging-server   # :8082
```

## Testing and feature flags

Run `bun run compile`, `bun run unit`, and `bun run ci-headless` for type, unit,
and browser validation. [Development](docs/development.md) explains individual
runners, fixed test profiles, mobile emulation, and repository structure.

`bun run flags` shows the committed production/staging rollout matrix;
`bun run flags:check` validates it. See [feature flags](docs/feature-flags.md) for
changing a rollout or adding a flag.

## Deployment

`bun run deploy:staging` and `bun run deploy:prod` run the full guarded deployment.
GitHub Actions deploys main to production and staging to staging. See
[deployment operations](docs/deployment.md) for environments, preview prerequisites,
analytics, infrastructure, and live verification, and
[dependency maintenance](docs/dependency-maintenance.md#deployment-preview-gate)
for the guard contract.
