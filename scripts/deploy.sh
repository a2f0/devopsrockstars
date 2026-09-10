#!/usr/bin/env bash
# Build and publish one environment to Cloudflare: store Worker first, so the
# API is live before the site that calls it, then the static website Worker.
#
# Custom domains belong to Terraform, not to these deployments.
set -euo pipefail

ENVIRONMENT="${1:-}"
case "$ENVIRONMENT" in
  staging | prod) shift ;;
  *)
    echo "Usage: $0 <staging|prod> [--dry-run] [--skip-migrations]" >&2
    exit 1
    ;;
esac

WRANGLER_ARGS=()
SKIP_MIGRATIONS=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      WRANGLER_ARGS=(--dry-run)
      SKIP_MIGRATIONS=true
      ;;
    --skip-migrations) SKIP_MIGRATIONS=true ;;
    *)
      echo "ERROR: Unsupported deployment argument: $1" >&2
      exit 1
      ;;
  esac
  shift
done

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

if [[ "$ENVIRONMENT" == staging ]]; then
  export PUBLIC_ENVIRONMENT=staging
  export STORE_API_ORIGIN=https://store-staging.devopsrockstars.com
else
  export PUBLIC_ENVIRONMENT=production
  export STORE_API_ORIGIN=https://store.devopsrockstars.com
fi
export WRANGLER_SEND_METRICS=false

pnpm --filter @devopsrockstars/frontend build

if [[ "$SKIP_MIGRATIONS" == false ]]; then
  pnpm --filter @devopsrockstars/backend run "db:migrate:$ENVIRONMENT"
fi

pnpm --filter @devopsrockstars/backend exec wrangler deploy \
  --env "$ENVIRONMENT" ${WRANGLER_ARGS[@]+"${WRANGLER_ARGS[@]}"}
pnpm --filter @devopsrockstars/frontend exec wrangler deploy \
  --env "$ENVIRONMENT" ${WRANGLER_ARGS[@]+"${WRANGLER_ARGS[@]}"}

echo "Cloudflare deployment completed ($ENVIRONMENT)."
