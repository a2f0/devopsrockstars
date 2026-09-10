# DevOps Rockstars

## Workspace layout

- `packages/frontend` — React site, static assets, Webpack configuration, and
  browser tests
- `packages/backend` — Cloudflare Worker, D1 migrations, and Wrangler
  configuration
- `packages/shared-types` — API types shared by the frontend and backend
- `packages/agent-tool` — guarded review, pull request, and merge tooling

Root scripts orchestrate the packages, so the existing development, test, and
deployment commands remain stable.

## Development

```shell
pip install pre-commit
pre-commit install
pnpm install
pnpm run start-server
```

The site and the store API are separate Workers, so local development runs
them side by side. Start the store Worker on port 8787 and the webpack server
proxies `/api` to it, keeping development same-origin:

```shell
cp packages/backend/.dev.vars.example packages/backend/.dev.vars
pnpm run db:migrate:local
pnpm run dev:cloudflare   # store Worker on :8787
pnpm run start-server     # site on :8080, proxying /api to :8787
```

The local store is deliberately sold out after the first migration. Add local
inventory before testing checkout:

```shell
pnpm --filter @devopsrockstars/backend exec wrangler d1 execute \
  devopsrockstars-store-staging --env staging --local \
  --command "UPDATE product_variants SET inventory_quantity = 5"
```

To see the site as staging renders it, with the store and search enabled:

```shell
pnpm run start-staging-server   # :8082
```

Testing

```shell
pnpm run ci
pnpm run ci-headless
```

Start the testing webpack server (on different port than normal development server) and run tests manually.

```shell
pnpm run start-test-server      # :8081, production feature set
pnpm run start-staging-server   # :8082, staging feature set
# in a different console tab
pnpm run test
pnpm run test-headless
```

`e2e/specs/basic.spec.ts` runs against the production build on :8081 and
asserts the store and search are hidden; `e2e/specs/staging.spec.ts` runs
against the staging build on :8082 and exercises them. One run covers both
environments' feature flags.

Run a specific spec

```shell
pnpm --filter @devopsrockstars/frontend exec wdio wdio.shared.conf.ts \
  --spec=./e2e/specs/basic.spec.ts
```

## Deployment

Both environments run entirely on Cloudflare. Each is a pair of Workers: a
static-assets Worker serving the webpack output, and a store Worker serving
`/api/*` against its own D1 database. Wrangler owns the Worker and asset
deployments; Terraform owns the custom domains.

| Environment | Site | Store API | Worker names |
| --- | --- | --- | --- |
| Production | `devopsrockstars.com` | `store.devopsrockstars.com` | `devopsrockstars-website-prod`, `devopsrockstars-store-prod` |
| Staging | `staging.devopsrockstars.com` | `store-staging.devopsrockstars.com` | `devopsrockstars-website-staging`, `devopsrockstars-store-staging` |

`www.devopsrockstars.com` is a second custom domain on the production website
Worker, serving the same content as the apex rather than redirecting to it,
which is what CloudFront did before the move. Neither Worker is reachable on
`workers.dev`, so the only hostnames are the ones above.

The store and search are not launched yet, so **production** hides their links
and routes and serves a not-found page for `/search` and `/store`. Staging
keeps them reachable so the storefront can be exercised end to end against the
Stripe test keys. Staging builds with `PUBLIC_ENVIRONMENT=staging`, which also
adds a `noindex, nofollow` meta tag, an `X-Robots-Tag` response header, and a
`robots.txt` that disallows everything, so only production is offered to search
engines.

Cloudflare prepends its own managed `robots.txt` block whose `User-agent: *`
group merges with ours, and `Allow` wins that tie, so the header and meta tag
are what actually keep staging out of search results.

GitHub Actions deploys `production` to production and `staging` to staging, and
`workflow_dispatch` deploys any branch to staging. Deployments run locally the
same way:

```shell
pnpm run deploy:staging
pnpm run deploy:prod
scripts/deploy.sh staging --dry-run   # build and validate without publishing
```

Each deployment builds the site for the environment, applies pending D1
migrations, publishes the store Worker, then publishes the site Worker.

### Cloudflare setup

1. Add `devopsrockstars.com` to Cloudflare, review the imported record scan
   against Route 53 — the Google Workspace `MX` records especially — and only
   then move the registrar's nameservers. `terraform output
   cloudflare_nameservers` prints the pair to set.

2. Both D1 databases already exist and their `database_id`s are committed in
   `packages/backend/wrangler.jsonc`. A new environment would add one with:

   ```shell
   pnpm --filter @devopsrockstars/backend exec wrangler d1 create \
     devopsrockstars-store-<env> --location=enam
   ```

3. Apply the schema, then set the actual price and inventory. The migration
   seeds the historical $20 price and zero stock as safe placeholders.

   ```shell
   pnpm run db:migrate:prod
   pnpm --filter @devopsrockstars/backend exec wrangler d1 execute \
     devopsrockstars-store --env prod --remote \
     --command "UPDATE product_variants SET unit_amount = 2000, inventory_quantity = 1"
   ```

4. Add the Stripe keys as Worker secrets, once per environment. Staging takes
   the Stripe test keys and production the live keys.

   ```shell
   for secret in STRIPE_PUBLISHABLE_KEY STRIPE_SECRET_KEY \
     STRIPE_WEBHOOK_SECRET CHECKOUT_HASH_SECRET; do
     pnpm --filter @devopsrockstars/backend exec wrangler secret put \
       "$secret" --env prod
   done
   ```

5. Register `https://store.devopsrockstars.com/api/webhooks/stripe` (and the
   `store-staging` equivalent) in Stripe for `payment_intent.succeeded`,
   `payment_intent.payment_failed`, and `payment_intent.canceled`. Use each
   endpoint's signing secret for that environment's `STRIPE_WEBHOOK_SECRET`.

6. Publish both environments, then apply Terraform to attach the custom
   domains. Wrangler must publish a Worker before Terraform can point a
   hostname at it.

   ```shell
   pnpm run deploy:staging
   pnpm run deploy:prod
   cd terraform && ./apply.sh
   ```

   Terraform needs `TF_VAR_cloudflare_api_token` in the environment and
   `cloudflare_account_id` in `main.tfvars`. The token needs Workers Scripts
   Edit, Workers Routes Edit, DNS Edit, Zone Read, and Zone Settings Edit — the
   last one for `always_use_https`, which restores the HTTPS redirect
   CloudFront used to perform. Creating the zone itself needs Zone Create,
   which is easier to do once in the dashboard.

7. Move the registrar's nameservers last, after Terraform has applied. The
   `MX` records must already exist in Cloudflare or mail stops the moment the
   delegation changes. Cloudflare only engages its proxy once the zone leaves
   `pending`, so
   the Worker hostnames cannot be tested before the move.

### Retiring a renamed Worker

Renaming a Worker publishes a new one; the old deployment keeps running, along
with its cron trigger and its bindings to the same production D1 database. The
`devopsrockstars-store` Worker that preceded `devopsrockstars-store-prod` has
been deleted for exactly that reason. After any future rename, confirm the
cutover, then retire the predecessor:

```shell
pnpm --filter @devopsrockstars/backend exec wrangler delete --name <old-worker>
```

Check for stragglers with `wrangler deployments list --name <old-worker>`, and
remember that Worker secrets cannot be read back — a rename means re-adding
every secret to the new Worker before it can serve traffic.

### Infrastructure

Terraform (`terraform/`) manages only Cloudflare now: the Worker custom
domains, the `www` hostname, and the Google Workspace `MX` records. The AWS
website stack it used to own — S3 buckets, CloudFront, the ACM certificate, the
Route 53 hosted zone, and the `s3-sync-devopsrockstars` IAM user — has been
destroyed. The only AWS dependency left is the S3 bucket holding Terraform
state, so `terraform` still needs AWS credentials for its backend.

Wrangler owns Worker and asset deployments; Terraform owns hostnames. Publish a
Worker before pointing a hostname at it.

### How the store works

D1 owns products, variants, inventory, orders, and processed Stripe event IDs.
Inventory is reserved atomically when checkout starts, restored when an order is
canceled, and protected from double-restock by the order-status transition
trigger. A one-minute cron cancels reservations that have been abandoned for ten
minutes, and customers can release a reservation immediately from checkout.

Checkout creation is limited to two attempts per minute, two active
reservations per salted network hash, twenty active reservations globally, and
two items per order. The edge limit uses Cloudflare's `CHECKOUT_RATE_LIMITER`
binding; D1 enforces the active-reservation caps and prevents accidental
duplicates for the same resumable browser session.

Signed Stripe events without the store's source metadata are acknowledged and
ignored. Store events that cannot be applied safely are recorded in
`stripe_event_alerts`; entries with `action = 'refund'` require operator action.
Check the open queue with:

```shell
pnpm --filter @devopsrockstars/backend exec wrangler d1 execute \
  devopsrockstars-store --env prod --remote \
  --command "SELECT * FROM stripe_event_alerts WHERE status = 'open' ORDER BY created_at"
```

The configuration for the site is in the [terraform folder](terraform).
