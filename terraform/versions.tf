terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.26"
    }
  }
  required_version = ">= 1.0.10"
}
