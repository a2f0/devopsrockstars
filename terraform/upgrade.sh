#!/usr/bin/env bash
set -euo pipefail

script_dir="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
cd "$script_dir"
# shellcheck source-path=SCRIPTDIR source=env.sh
source "$script_dir/env.sh"
load_terraform_env "$script_dir/.."

run_terraform init -input=false -reconfigure -upgrade
