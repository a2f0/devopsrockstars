# @devopsrockstars/backend

The DevOpsRockstars store API: a Cloudflare Worker that serves `/api/*` for the
site against its own D1 database, covering the catalog, Stripe checkout and
webhooks, and the store admin with its Better Auth sign-in. Production runs at
<https://store.devopsrockstars.com> and staging at
<https://store-staging.devopsrockstars.com>. `migrations/` holds the D1 schema
and `wrangler.jsonc` the configuration for both environments.

## Local development

The site and the store API are separate Workers, so local development runs
them side by side. Start the store Worker on port 8787 and the Bun server
proxies `/api` to it, keeping development same-origin. The local Worker
command allows the frontend origins on ports 8080, 8081, and 8082 for both
`localhost` and `127.0.0.1`; deployed Workers retain their domain-only origin
configuration. From the repository root, running the last two commands in
separate terminals:

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

## Local admin account

`/admin` signs in with the same Better Auth setup as
[ct](https://github.com/a2f0/ct): registration is closed, so an operator
provisions each account from the command line. For local development, set
`BETTER_AUTH_SECRET` in `packages/backend/.dev.vars` (copied above), then:

```shell
bun run admin:user create --local --email admin@example.test
```

The command prompts for a 12–128 character password without echoing it. See
[deployment operations](../../docs/deployment.md#store-admin) for deployed
accounts, and [store operations](../../docs/deployment.md#store-operations) for
inventory reservations, checkout limits, and the Stripe alert queue.
