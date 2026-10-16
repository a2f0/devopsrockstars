#!/usr/bin/env bash
set -euo pipefail

script_dir="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
cd "$script_dir"
# shellcheck source-path=SCRIPTDIR source=env.sh
source "$script_dir/env.sh"
load_terraform_env "$script_dir/.."

# The backend is committed in full, so -reconfigure re-reads it and never
# offers to migrate state from a previously initialized backend.
run_terraform init -input=false -reconfigure
