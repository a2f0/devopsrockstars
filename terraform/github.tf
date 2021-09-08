provider "github" {
  token = var.github_token
  owner = var.github_owner
}

resource "github_actions_secret" "vercel_org_id" {
  repository      = var.github_repository
  secret_name     = "VERCEL_ORG_ID"
  plaintext_value = var.vercel_org_id
}

resource "github_actions_secret" "vercel_project_id" {
  repository      = var.github_repository
  secret_name     = "VERCEL_PROJECT_ID"
  plaintext_value = vercel_project.project.id
}

resource "github_actions_secret" "vercel_token" {
  repository      = var.github_repository
  secret_name     = "VERCEL_TOKEN"
  plaintext_value = var.vercel_token
}

resource "github_actions_secret" "slack_webhook_url" {
  repository      = var.github_repository
  secret_name     = "SLACK_WEBHOOK_URL"
  plaintext_value = var.slack_webhook_url
}
