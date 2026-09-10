output "website_production_url" {
  value = "https://${cloudflare_workers_custom_domain.website_production.hostname}"
}

output "website_staging_url" {
  value = "https://${cloudflare_workers_custom_domain.website_staging.hostname}"
}

output "store_production_url" {
  value = "https://${cloudflare_workers_custom_domain.store_production.hostname}"
}

output "store_staging_url" {
  value = "https://${cloudflare_workers_custom_domain.store_staging.hostname}"
}

output "cloudflare_nameservers" {
  value = data.cloudflare_zone.website.name_servers
}

output "website_www_url" {
  value = "https://${cloudflare_workers_custom_domain.website_www.hostname}"
}
