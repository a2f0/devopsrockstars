terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.26"
    }
  }
  # The S3 backend gained lockfile-based locking (use_lockfile) in 1.10.
  required_version = ">= 1.10"
}
