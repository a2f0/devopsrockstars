# DevOpsRockstars Frontend

## Development

```shell
pip install pre-commit
pre-commit install
pnpm install
pnpm run start-server
```

The ordinary webpack server is useful for the existing static pages. Store API
development runs the built SPA and Worker together through Wrangler:

```shell
cp .dev.vars.example .dev.vars
pnpm run db:migrate:local
pnpm run dev:cloudflare
```

The local store is deliberately sold out after the first migration. Add local
inventory before testing checkout:

```shell
pnpm exec wrangler d1 execute devopsrockstars-store --local \
  --command "UPDATE product_variants SET inventory_quantity = 5"
```

Testing

```shell
pnpm run ci
pnpm run ci-headless
```

Start the testing webpack server (on different port than normal development server) and run tests manually.

```shell
pnpm run start-test-server
# in a different console tab
pnpm run test
pnpm run test-headless
```

Run a specific spec

```shell
npx wdio wdio.shared.conf.ts --spec=./specs/basic.spec.ts
```

## Production

The existing static site is deployed to AWS by GitHub Actions. The store adds a
Cloudflare Worker and D1 database; cut over the site after the Cloudflare
resources and Stripe webhook are configured.

### Cloudflare and Stripe setup

1. Create the database and copy its UUID into `wrangler.jsonc`:

   ```shell
   pnpm exec wrangler d1 create devopsrockstars-store --location=enam
   ```

2. Apply the schema, then set the actual price and inventory. The migration
   seeds the historical $20 price and zero stock as safe placeholders.

   ```shell
   pnpm run db:migrate:remote
   pnpm exec wrangler d1 execute devopsrockstars-store --remote \
     --command "UPDATE product_variants SET unit_amount = 2000, inventory_quantity = 1"
   ```

3. Add the Stripe keys as Worker secrets. The publishable key is safe to return
   to the browser, but it is still managed with the other environment-specific
   configuration.

   ```shell
   pnpm exec wrangler secret put STRIPE_PUBLISHABLE_KEY
   pnpm exec wrangler secret put STRIPE_SECRET_KEY
   pnpm exec wrangler secret put STRIPE_WEBHOOK_SECRET
   ```

4. Register `https://<store-domain>/api/webhooks/stripe` in Stripe for
   `payment_intent.succeeded`, `payment_intent.payment_failed`, and
   `payment_intent.canceled`. Use that endpoint's signing secret for
   `STRIPE_WEBHOOK_SECRET`.

5. Build and deploy:

   ```shell
   pnpm run deploy:cloudflare
   ```

The Worker serves the webpack output as a single-page application and handles
only `/api/*` dynamically. D1 owns products, variants, inventory, orders, and
processed Stripe event IDs. Inventory is reserved atomically when checkout
starts, restored when an order is canceled, and protected from double-restock
by the order-status transition trigger. A ten-minute cron cancels reservations
that have been abandoned for thirty minutes.

Signed Stripe events without the store's source metadata are acknowledged and
ignored. Store events that cannot be applied safely are recorded in
`stripe_event_alerts`; entries with `action = 'refund'` require operator action.
Check the open queue with:

```shell
pnpm exec wrangler d1 execute devopsrockstars-store --remote \
  --command "SELECT * FROM stripe_event_alerts WHERE status = 'open' ORDER BY created_at"
```

The configuration for the site is in the [terraform folder](terraform).
