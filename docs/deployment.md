# Deployment operations

[Dependency maintenance](dependency-maintenance.md#deployment-preview-gate) defines
the required live preview, resource identity checks, and migration restrictions.
Run commands from the repository root unless they explicitly change directory.
Provisioning and infrastructure changes require a separately reviewed rollout.

## Click analytics

The explicitly initialized `@a2f0/ct-client` tracks clicks on the deployed sites
under `site: devopsrockstars`. Production (apex and `www`) and staging are
separate `environment` values in [CT admin](https://ct-admin.a2f0.net).
The build environment must match the exact HTTPS origin; local development,
preview hosts, and browser automation do not collect clicks.

The `app` dimension identifies `skyline`, `company`, `search`, and `store`;
shared navigation uses `website`. Skyline's open shadow root inherits its host's
app boundary. Page names come from a fixed route allowlist, never query strings,
receipt identifiers, or unknown paths. The SDK skips inputs, editable content,
and `data-ct-ignore` areas and never reads text, form values, or link URLs.
Static actions on search, checkout, and receipt pages remain trackable.

GPC, Do Not Track, and the CT browser extension remain effective. The SDK also
honors an existing `ct:opt-out` preference in local storage. The collector records
the request IP and approximate Cloudflare location, with 90-day retention. See
[CT privacy](https://github.com/a2f0/ct/blob/main/docs/privacy.md) for the full data
contract and opt-out behavior.

## Error reporting

Sentry uses the `tearleads` organization and four separate projects:

| Runtime | Staging | Production |
| --- | --- | --- |
| React site | `devopsrockstars-web-staging` | `devopsrockstars-web-production` |
| Store Worker | `devopsrockstars-api-staging` | `devopsrockstars-api-production` |

The public DSNs are in `scripts/deploy/sentryProjects.ts`. Deployments embed
only the selected DSN, runtime, environment, and full Git commit. Release names
are `devopsrockstars-web@<commit>` and `devopsrockstars-api@<commit>`, with the
environment as the distribution. Development servers and ordinary local builds
have reporting disabled. Browser reporting also requires the matching deployed
HTTPS origin.

GitHub Actions needs the repository secret `SENTRY_AUTH_TOKEN` with source-map
upload access to all four projects. Local deployments need the same variable;
the ignored `.secrets/prod/shared.env` and `.secrets/ci/secrets.env` hold it.
Never give the upload token a public build prefix. The deploy command passes it
only to the pinned Sentry CLI uploader, with an isolated environment and home.

The deploy guard builds private maps in `build/sentry`, validates both Workers
and the live resources, uploads each runtime's maps, then publishes. Missing
credentials, incomplete maps, upload failures, or changed artifacts stop
publication. Dry runs validate maps locally without uploading or requiring a
Sentry token. The API publishes the exact staged JavaScript bundle. Cloudflare
source-map uploads remain disabled; Sentry receives the private maps. Frontend
maps are excluded from the public build directory, even for ordinary builds.

The integration follows Tearleads' collection policy: private clients and scopes,
no automatic integrations, tracing, profiling, sessions, replay, logs, or
breadcrumbs. Both the SDK callback and transport rebuild error events from an
allowlist. Reports contain a generic error type and placeholder message,
generated application bundle positions, release/environment, and a fixed error
source. API reports also include a fixed operation name. Raw exception text,
request data, URLs, query parameters, payment/order IDs, headers, cookies,
function names, source context, and user information are excluded. Third-party
or extension-only browser stacks are discarded. Only error envelopes can leave
the transport, with credentials and referrer omitted. Reports are deduplicated
and limited to five per minute and twenty per page load (per hour on each API
isolate). API clients and their pending sends belong to a single request or
scheduled job; only the rate-limit and deduplication state is shared.

React root and recovery errors, uncaught browser errors, and unhandled rejections are
captured. Unexpected API 5xx responses report through `waitUntil`; known
unconfigured checkout/webhook responses and expected 4xx responses
stay local. Scheduled cleanup reports both individual order failures and
failures of the job itself, preserving the job's rejection.

All four projects enable **Prevent Storing of IP Addresses**, **Data Scrubber**,
and **Default Scrubbers**, and disable fetching source files from the public
site. Keep these settings enabled. Direct browser requests still expose network
metadata to Sentry's infrastructure; the SDK does not send a stored user identity.

The browser and real workerd regression tests intercept Sentry traffic locally,
assert the privacy policy, and verify Worker frames resolve through the generated
map. To verify a deployed release, inspect its project in
[Sentry](https://tearleads.sentry.io/projects/) and confirm the environment,
commit, private source context, and absence of source-map processing errors.
Do not add a public endpoint for deliberately triggering errors.

## Environments

Both environments run entirely on Cloudflare. Each is a pair of Workers: a
static-assets Worker serving the Bun output, and a store Worker serving
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

Disabled store/search flags hide their navigation links and routes, so those
paths serve a not-found page. When the store is enabled in staging, it uses
Stripe test keys. Staging builds with `PUBLIC_ENVIRONMENT=staging`, which also
adds a `noindex, nofollow` meta tag, an `X-Robots-Tag` response header, and a
`robots.txt` that disallows everything, so only production is offered to search
engines.

Home mounts the shared interactive 3D skyline from
`@a2f0/skyline` ([a2f0/skyline](https://github.com/a2f0/skyline)) in the page
itself, inside a shadow root, and gives it the site's own three.js through
`@a2f0/skyline/three`, so the skyline and the hat preview share one engine.
Every build serves its assets at `/static/skyline/`. Leaving Home destroys the
viewer and releases its WebGL contexts. If the 3D skyline cannot start, as
without WebGL 2, the viewer says why in its place and in the browser console,
and its **show original** button still opens the original drawing, which its
control bar also offers once the scene runs. If `store` is enabled, the viewer
mounts after the background hat preview succeeds or fails, so the two models
build in sequence. With the store disabled, the 3D skyline starts directly.

Cloudflare prepends its own managed `robots.txt` block whose `User-agent: *`
group merges with ours, and `Allow` wins that tie, so the header and meta tag
are what actually keep staging out of search results.

GitHub Actions deploys `main` to production and `staging` to staging, and
`workflow_dispatch` defaults to read-only previews. Explicit
`operation=deploy-staging` deploys the selected branch to staging. Local deployment
commands use the same guard:

```shell
bun run deploy:staging
bun run deploy:prod
bun scripts/deploy/deploy.ts staging --dry-run   # complete bundle and live-resource preview
```

Each deployment builds the site, dry-runs both Workers, and checks existing live
identities before publishing the store and site Workers. D1 must have zero
pending migrations; missing or incomplete resource evidence holds deployment.
Set the verified `CLOUDFLARE_ACCOUNT_ID` and API token. CI uses the repository
account variable, and serializes deployments per environment. See
[dependency maintenance](dependency-maintenance.md#deployment-preview-gate)
for exact coverage, permissions, and the migration restriction.

See [Cloudflare setup](#cloudflare-setup) for Cloudflare provisioning,
Terraform setup (state in Cloudflare R2, credentials and variables from the
gitignored `.secrets` link to matrix-secrets), Worker identity changes, and the
store alert queue. Resource creation, secret changes, and schema rollouts
require separate review and a complete execution preview. Routine maintenance
preserves existing identities and never applies remote SQL.

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

4. Add the Stripe test keys, checkout hash secret, and admin auth secret to the
   staging Worker. Set only the checkout hash and admin auth secrets in
   production for the current disabled store configuration.

   The maintenance guard expects only `BETTER_AUTH_SECRET` and
   `CHECKOUT_HASH_SECRET` in production while its committed store flag is off.
   Provisioning live Stripe secrets and enabling that flag
   require a separate reviewed rollout; dependency maintenance preserves the
   current secret set. `BETTER_AUTH_SECRET` is provisioned as described under
   [store admin](#store-admin).

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

   The scripts read `TF_VAR_cloudflare_api_token`, the state key, and
   `.secrets/prod/main.tfvars`, which supplies `host`, `domain`, and
   `cloudflare_account_id` (see [Infrastructure](#infrastructure)). The token
   needs Workers Scripts Edit, Workers Routes Edit, DNS Edit, Zone Read, and Zone
   Settings Edit. Creating the zone itself needs Zone Create, which is easier to
   do once in the dashboard.

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
hostname, the HTTPS redirect, and the Google Workspace `MX` records for both
environments in one stack. Its state is the object `terraform.tfstate` in the
Cloudflare R2 bucket `devopsrockstars-com-terraform-state`, read through the S3
backend with lockfile locking, so Terraform 1.10 or later is required. The
bucket was created by hand and is not managed here, and the backend settings
are committed in `terraform/main.tf`. No AWS account is involved.

`.secrets` is a gitignored link to this project's folder in `matrix-secrets`,
which the matrix workspace manages and backs up
([a2f0/matrix `docs/secrets.md`](https://github.com/a2f0/matrix/blob/main/docs/secrets.md)).
Link it from the repository root and confirm Git ignores it:

```shell
ln -s ../matrix-secrets/devopsrockstars.com .secrets   # ../../../ from a matrix checkout
git check-ignore .secrets
```

`init.sh`, `upgrade.sh`, `apply.sh`, and `destroy.sh` load
`.secrets/prod/shared.env` when present and then `.secrets/prod/app.env`, which
wins; values in the files replace ones already exported in the shell.
`apply.sh` and `destroy.sh` pass `.secrets/prod/main.tfvars` to Terraform with
`-var-file`. Each script stops before running Terraform when `app.env`,
`main.tfvars`, or a variable is missing:

| Variable | File | Purpose |
| --- | --- | --- |
| `TF_VAR_cloudflare_api_token` | `shared.env` | Cloudflare provider token, copied from the account-level token |
| `TF_STATE_ACCESS_KEY_ID` | `app.env` | R2 S3 key ID of the token limited to the state bucket |
| `TF_STATE_SECRET_ACCESS_KEY` | `app.env` | R2 S3 secret of that token |
| `host`, `domain`, `cloudflare_account_id` | `main.tfvars` | Staging host label, zone name, and Cloudflare account for the Terraform resources |

The repository keeps no encrypted secret files. The scripts no longer read a
`terraform/main.tfvars`; delete any copy left in an older clone once `.secrets`
is linked.

Only Terraform receives the state key, as `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY`, and the scripts unset `AWS_PROFILE` and
`AWS_SESSION_TOKEN` so an ambient AWS profile or session cannot redirect the
backend. `init.sh` and `upgrade.sh` pass `-reconfigure`, so a working
directory initialized against the former S3 bucket switches to R2 without
offering to migrate state.

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
Review and resolve the open queue in the [store admin](#store-admin), or
check it with:

```shell
bun run --cwd packages/backend --bun wrangler d1 execute \
  devopsrockstars-store --env prod --remote \
  --command "SELECT * FROM stripe_event_alerts WHERE status = 'open' ORDER BY created_at"
```

The configuration for the site is in the [terraform folder](../terraform).

## Store admin

`/admin` on each site manages inventory, prices, and product and size listings,
lists orders with their shipping addresses, and resolves Stripe alerts. It is a
lazily loaded route of the site that calls `/api/auth/*` and `/api/admin/*` on
the environment's store Worker, so the admin works while the `store` flag is
off. Production pages send `X-Robots-Tag: noindex, nofollow` and the page adds
a matching robots meta tag.

Authentication follows [ct](https://github.com/a2f0/ct): Better Auth with
email and password, sign-up disabled in the library, and only sign-in, session,
sign-out, and password-change routes reachable. Sessions last eight hours in a
host-only `Secure`, `HttpOnly`, `SameSite=Lax` cookie on the store API host,
which the site and API share as one site. Credentialed CORS is limited to the
configured storefront origins on the admin and auth routes, and every mutation
requires one of those origins and a JSON body. Sign-in and password changes are
limited to five attempts a minute per address. Expired sessions,
verifications, and day-old rate-limit records are removed hourly by the store
cron. Admin changes are logged as `admin.*` events with the administrator's
email in Workers observability.

Stock edits send the quantity they replace. If a checkout reserved or released
units meanwhile, the change is refused and the page shows the current stock.

Each store Worker needs a `BETTER_AUTH_SECRET` of at least 32 characters, and
the D1 database needs the `auth_*` tables from
`packages/backend/migrations/0006_admin_auth.sql`. Neither is reachable without
the other: a missing secret makes every admin and auth route return 503 while
the storefront keeps working. Generate the secret without displaying it:

```shell
openssl rand -base64 48 | bun run --cwd packages/backend --bun wrangler \
  secret put BETTER_AUTH_SECRET --env <staging|prod>
```

Rotating it signs every administrator out.

Provision or recover an administrator. The command prompts twice for the
password without echoing it, or reads one line with `--password-stdin`; it
never accepts a password argument. Reset replaces the password and revokes
every session:

```shell
bun run admin:user create --env prod --email <email>
bun run admin:user reset --env prod --email <email>
```

Signed-in administrators change their own password under **Account**, which
signs out their other sessions. The sign-in and password forms use standard
`username`, `current-password`, and `new-password` autocomplete fields and
finish with a navigation or form removal, so browsers and password managers
offer to save or update the password.

## Reviewed preview from CI

Follow the [deployment preview gate](dependency-maintenance.md#deployment-preview-gate)
for the reviewed-branch dispatch command, both environments' required evidence,
and the distinction between preview and an authorized staging deployment.
