provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# The zone is created once in the Cloudflare dashboard so its record scan can
# be reviewed before the registrar's nameservers move off Route 53.
data "cloudflare_zone" "website" {
  filter = {
    account = { id = var.cloudflare_account_id }
    name    = var.domain
  }
}

# Wrangler publishes each named Worker before Terraform attaches its hostname,
# so deployments never wait on this stack.
resource "cloudflare_workers_custom_domain" "website_production" {
  account_id = var.cloudflare_account_id
  zone_id    = data.cloudflare_zone.website.id
  hostname   = var.domain
  service    = "devopsrockstars-website-prod"
}

resource "cloudflare_workers_custom_domain" "website_staging" {
  account_id = var.cloudflare_account_id
  zone_id    = data.cloudflare_zone.website.id
  hostname   = "${var.host}.${var.domain}"
  service    = "devopsrockstars-website-staging"
}

resource "cloudflare_workers_custom_domain" "store_production" {
  account_id = var.cloudflare_account_id
  zone_id    = data.cloudflare_zone.website.id
  hostname   = "store.${var.domain}"
  service    = "devopsrockstars-store-prod"
}

resource "cloudflare_workers_custom_domain" "store_staging" {
  account_id = var.cloudflare_account_id
  zone_id    = data.cloudflare_zone.website.id
  hostname   = "store-${var.host}.${var.domain}"
  service    = "devopsrockstars-store-staging"
}

# CloudFront enforced HTTPS with redirect-to-https. Worker custom domains serve
# plain HTTP as well, so the zone has to re-establish that redirect or the move
# quietly downgrades every visitor who types the bare hostname.
resource "cloudflare_zone_setting" "always_use_https" {
  zone_id    = data.cloudflare_zone.website.id
  setting_id = "always_use_https"
  value      = "on"
}

# Google Workspace mail, carried over verbatim from Route 53. Cloudflare's
# zone scan imported nothing, so these are the only thing standing between the
# nameserver move and dropped mail. They must exist before the registrar cuts
# over.
locals {
  google_workspace_mx = {
    aspmx  = { content = "aspmx.l.google.com", priority = 1 }
    alt1   = { content = "alt1.aspmx.l.google.com", priority = 5 }
    alt2   = { content = "alt2.aspmx.l.google.com", priority = 5 }
    aspmx2 = { content = "aspmx2.googlemail.com", priority = 10 }
    aspmx3 = { content = "aspmx3.googlemail.com", priority = 10 }
  }
}

resource "cloudflare_dns_record" "mx" {
  for_each = local.google_workspace_mx

  zone_id  = data.cloudflare_zone.website.id
  name     = var.domain
  type     = "MX"
  content  = each.value.content
  priority = each.value.priority
  ttl      = 1
}

# www served the same content as the apex on CloudFront, with no redirect, so
# it stays a second hostname on the website Worker rather than becoming a 301.
resource "cloudflare_workers_custom_domain" "website_www" {
  account_id = var.cloudflare_account_id
  zone_id    = data.cloudflare_zone.website.id
  hostname   = "www.${var.domain}"
  service    = "devopsrockstars-website-prod"
}
