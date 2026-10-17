#!/usr/bin/env bash
set -euo pipefail

script_dir="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
cd "$script_dir"
# shellcheck source-path=SCRIPTDIR source=env.sh
source "$script_dir/env.sh"
load_terraform_env "$script_dir/.."

private_plan_dir="$(mktemp -d)"
cleanup() {
  rm -rf -- "$private_plan_dir"
}
trap cleanup EXIT

run_terraform plan -input=false -var-file="$terraform_var_file" -out="$private_plan_dir/reviewed.tfplan"
run_terraform show -json "$private_plan_dir/reviewed.tfplan" > "$private_plan_dir/plan.json"
"$script_dir/../node_modules/.bin/agent-tool" dependencies check-terraform-plan "$private_plan_dir/plan.json"
run_terraform show "$private_plan_dir/reviewed.tfplan"

printf 'After reviewing the plan, type APPLY to continue: '
IFS= read -r approval
if [[ "$approval" != APPLY ]]; then
  echo 'Terraform apply held.' >&2
  exit 1
fi

run_terraform apply "$private_plan_dir/reviewed.tfplan"
