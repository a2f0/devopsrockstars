provider "vercel" {
  token = var.vercel_token
}

resource "vercel_project" "project" {
  name             = "devopsrockstars-frontend"
  output_directory = "build"
  domain   {
    name           = "devopsrockstars.com"
  }

  git_repository {
    type = "github"
    repo = "${var.github_owner}/${var.github_repository}"
  }
}
