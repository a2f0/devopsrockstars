terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 3.0"
    }
    vercel = {
      source  = "chronark/vercel"
      version = "0.14.2"
    }
    github = {
      source  = "integrations/github"
      version = "4.17.0"
    }
  }
  required_version = ">= 1.0.10"
}
