# Deployment operations

The [README](../README.md#deployment) lists environments and normal deployment
commands. [Dependency maintenance](dependency-maintenance.md#deployment-preview-gate)
defines the required live preview, resource identity checks, and migration
restrictions. Run commands below from the repository root unless they change
directory explicitly. Provisioning and infrastructure changes require a separate
reviewed rollout; the maintenance deploy commands cannot bootstrap resources.

## Cloudflare setup

The following describes the original bootstrap requirements. The maintenance
deployment guard requires these resources and their migration table to already
exist; it cannot bootstrap a new environment. New resources or schema changes
need a separately reviewed execution preview before any mutation.

1. Add `devopsrockstars.com` to Cloudflare, review the imported record scan
   against Route 53 — the Google Workspace `MX` records especially — and only
   then move the registrar's nameservers. `terraform output
   cloudflare_nameservers` prints the pair to set.

2. Both D1 databases already exist and their `database_id`s are committed in
   `packages/backend/wrangler.jsonc`. A new environment would add one with:

   ```shell
   bun run --cwd packages/backend --bun wrangler d1 create \
     devopsrockstars-store-<env> --location=enam
   ```

3. The initial schema seeded the historical $20 price and zero stock as safe
   placeholders. `bun run db:check:prod` verifies the existing migration table
   and requires zero pending migrations; it applies no remote SQL. Schema,
   price and inventory changes require a separate reviewed migration rollout
   with a complete execution preview before remote SQL is run. There is no
   generic remote migration apply command in this maintenance workflow.

   ```shell
   bun run db:check:prod
   ```

4. Add the Stripe test keys and checkout hash secret to the staging Worker.
   Set only the checkout hash secret in production for the current disabled
   store configuration.

   The maintenance guard expects only `CHECKOUT_HASH_SECRET` in production while
   its committed store flag is off. Provisioning live Stripe secrets and enabling that flag
   require a separate reviewed rollout; dependency maintenance preserves the
   current secret set.

   ```shell
   for secret in STRIPE_PUBLISHABLE_KEY STRIPE_SECRET_KEY \
     STRIPE_WEBHOOK_SECRET CHECKOUT_HASH_SECRET; do
     bun run --cwd packages/backend --bun wrangler secret put \
       "$secret" --env staging
   done
   bun run --cwd packages/backend --bun wrangler secret put \
     CHECKOUT_HASH_SECRET --env prod
   ```

5. Register `https://store.devopsrockstars.com/api/webhooks/stripe` (and the
   `store-staging` equivalent) in Stripe for `payment_intent.succeeded`,
   `payment_intent.payment_failed`, and `payment_intent.canceled`. Use each
   endpoint's signing secret for that environment's `STRIPE_WEBHOOK_SECRET`.

6. Initial provisioning published the Workers before Terraform attached their
   custom domains. Maintenance deploys require the existing Workers and domains
   to pass the live inspection, so they never use that bootstrap sequence.
   For a separately reviewed Terraform change, initialize the real backend,
   inspect a complete saved plan, and apply that exact plan only if it has no
   resource deletion or replacement:

   ```shell
   bun install --frozen-lockfile
   cd terraform
   ./init.sh
   ./apply.sh
   ```

   `apply.sh` uses a private saved plan, rejects destructive or incomplete
   actions, shows the plan for review, and requires an explicit `APPLY` response
   before executing it. The private plan files are removed on exit.

   Routine Worker maintenance uses `bun run deploy:staging` and
   `bun run deploy:prod` after their guarded dry-runs.

   Terraform needs `TF_VAR_cloudflare_api_token` in the environment and
   `cloudflare_account_id` in `main.tfvars`. The token needs Workers Scripts
   Edit, Workers Routes Edit, DNS Edit, Zone Read, and Zone Settings Edit.
   Creating the zone itself needs Zone Create, which is easier to do once in
   the dashboard.

   Zone Settings Edit is required for `cloudflare_zone_setting.always_use_https`,
   which restores the HTTPS redirect CloudFront used to perform. **A token
   without it fails the whole apply on that resource**, and cannot read the
   setting either, so Terraform reports it as missing even when it is enabled in
   the dashboard. Toggling it under SSL/TLS → Edge Certificates fixes the
   behaviour immediately; widening the token is what makes Terraform agree.

7. Move the registrar's nameservers last, after Terraform has applied. The
   `MX` records must already exist in Cloudflare or mail stops the moment the
   delegation changes. Cloudflare only engages its proxy once the zone leaves
   `pending`, so
   the Worker hostnames cannot be tested before the move.

## Worker identity

Keep the existing Worker names, domains and database bindings during maintenance.
A rename or retirement is a separate infrastructure operation. The dependency
upgrade workflow never deletes, replaces, recreates or retires a resource; its
preview guard holds any identity change.
After a separately reviewed rename, confirm the new Worker serves traffic before
retiring the predecessor. The old Worker keeps its cron trigger and D1 binding
until it is retired; its secrets cannot be read back, so provision them on the
new Worker before cutover.

## Infrastructure

Terraform (`terraform/`) manages the Cloudflare Worker custom domains, the `www`
hostname, and the Google Workspace `MX` records. Its state remains in an S3
bucket, so Terraform still needs AWS credentials for its backend.

Wrangler owns Worker and asset deployments; Terraform owns hostnames. Publish a
Worker before pointing a hostname at it.

## Store operations

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
bun run --cwd packages/backend --bun wrangler d1 execute \
  devopsrockstars-store --env prod --remote \
  --command "SELECT * FROM stripe_event_alerts WHERE status = 'open' ORDER BY created_at"
```

The configuration for the site is in the [terraform folder](../terraform).
