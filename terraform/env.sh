# Sourced by the Terraform scripts in this directory; it does nothing when run.
#
# .secrets is a gitignored link to matrix-secrets/devopsrockstars.com. Its
# production tier holds this stack's credentials and variables: shared.env,
# loaded first when present, holds TF_VAR_cloudflare_api_token; app.env, loaded
# last so it wins, holds the state bucket token's R2 S3 key as
# TF_STATE_ACCESS_KEY_ID and TF_STATE_SECRET_ACCESS_KEY; and main.tfvars holds
# the stack's remaining input variables. load_terraform_env sets
# terraform_var_file to that file's path for the scripts' -var-file. Values in
# the env files replace ones already set in the shell. Call load_terraform_env
# as a plain command, not under `if` or `||`, so errexit still stops the script
# on a malformed line in either env file.

load_terraform_env() {
  local tier_dir="$1/.secrets/prod"
  local missing=()

  if [[ ! -f "$tier_dir/app.env" ]]; then
    echo "ERROR: $tier_dir/app.env is missing." >&2
    echo "Link .secrets to matrix-secrets/devopsrockstars.com; see the" >&2
    echo "Infrastructure section of docs/deployment.md." >&2
    return 1
  fi
  if [[ ! -f "$tier_dir/main.tfvars" ]]; then
    echo "ERROR: $tier_dir/main.tfvars is missing." >&2
    echo "Link .secrets to matrix-secrets/devopsrockstars.com; see the" >&2
    echo "Infrastructure section of docs/deployment.md." >&2
    return 1
  fi
  if [[ -f "$tier_dir/shared.env" ]]; then
    # shellcheck source=/dev/null
    source "$tier_dir/shared.env"
  fi
  # shellcheck source=/dev/null
  source "$tier_dir/app.env"

  [[ -n "${TF_VAR_cloudflare_api_token:-}" ]] ||
    missing+=("TF_VAR_cloudflare_api_token")
  [[ -n "${TF_STATE_ACCESS_KEY_ID:-}" ]] ||
    missing+=("TF_STATE_ACCESS_KEY_ID")
  [[ -n "${TF_STATE_SECRET_ACCESS_KEY:-}" ]] ||
    missing+=("TF_STATE_SECRET_ACCESS_KEY")
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "ERROR: Missing Terraform variables in $tier_dir:" >&2
    printf '  - %s\n' "${missing[@]}" >&2
    return 1
  fi

  # Set after sourcing, so neither env file can point it elsewhere.
  # shellcheck disable=SC2034 # read by the scripts that source this file
  terraform_var_file="$tier_dir/main.tfvars"

  # The state key stays unexported even if app.env exports it, and an ambient
  # AWS profile or session token must not redirect the backend or pair with it.
  export -n TF_STATE_ACCESS_KEY_ID TF_STATE_SECRET_ACCESS_KEY
  unset AWS_PROFILE AWS_SESSION_TOKEN
}

# The S3 backend reads the R2 key as AWS credentials. Only Terraform receives
# them; nothing else the scripts run sees the state key.
run_terraform() {
  AWS_ACCESS_KEY_ID="$TF_STATE_ACCESS_KEY_ID" \
    AWS_SECRET_ACCESS_KEY="$TF_STATE_SECRET_ACCESS_KEY" \
    TF_VAR_cloudflare_api_token="$TF_VAR_cloudflare_api_token" \
    command terraform "$@"
}
