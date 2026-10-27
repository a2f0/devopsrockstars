# DevOpsRockstars

DevOpsRockstars is a DevOps consulting company. This repository holds its
website, a React site with an interactive 3D skyline, a company contact page,
and a store, together with the Cloudflare Worker behind the store API. This
repo is available on the web at <https://devopsrockstars.com>.

## Quick start

Install [mise](https://mise.jdx.dev) and activate it in your shell, and Python
with `pip` for the [pre-commit](https://pre-commit.com) hooks.

```shell
mise install
pip install pre-commit==4.7.0
pre-commit install
bun install
bun run start-server   # http://localhost:8080
```

Home and Company work on their own. The store and the admin call the store
API, a separate local Worker; the
[backend README](packages/backend/README.md#local-development) starts it beside
the site.

## Workspace layout

| Package | Contents |
| --- | --- |
| [`packages/frontend`](packages/frontend/README.md) | React site, static assets, Bun build and development server, and browser tests |
| [`packages/backend`](packages/backend/README.md) | Store API Worker, D1 migrations, and Wrangler configuration |
| [`packages/shared-types`](packages/shared-types) | API types shared by the frontend and backend |
| [`packages/diagnostics`](packages/diagnostics) | Private browser and Worker Sentry error reporting |

Run commands from the repository root. Root scripts orchestrate the packages,
so the development, test, and deployment commands keep stable names.
Maintenance helpers live in `scripts/`, and the Cloudflare hostnames and DNS
records in `terraform/`.

## Common commands

```shell
bun run start-staging-server   # http://localhost:8082 with the staging flag configuration
bun run compile                # TypeScript type check
bun run unit                   # unit tests
bun run ci-headless            # headless browser suite
bun run flags                  # show the production/staging rollout matrix
bun run flags:check            # validate the rollout matrix
```

## Store admin

`/admin` manages inventory, prices, and listings, shows orders, and resolves
Stripe alerts. Registration is closed, so an operator provisions each account
with `bun run admin:user`. The
[backend README](packages/backend/README.md#local-admin-account) covers a local
account, and [deployment operations](docs/deployment.md#store-admin) deployed
ones.

## Deployment

GitHub Actions deploys `main` to production and `staging` to staging.
`bun run deploy:staging` and `bun run deploy:prod` run the same guarded
deployment locally.

## Guides

- [Development](docs/development.md): toolchain, development servers, test
  runners and fixed test profiles, mobile emulation, architecture, and script
  layout
- [Feature flags](docs/feature-flags.md): changing a rollout or adding a flag
- [Deployment operations](docs/deployment.md): environments, preview
  prerequisites, analytics, infrastructure, store operations, and live
  verification
- [Dependency maintenance](docs/dependency-maintenance.md): upgrade
  procedures, active constraints, security override removal conditions, and
  the [deployment preview gate](docs/dependency-maintenance.md#deployment-preview-gate)
  that guards every deployment
