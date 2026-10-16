# State lives in the Cloudflare R2 bucket devopsrockstars-com-terraform-state
# (S3-compatible). env.sh hands the bucket token's R2 S3 key from
# .secrets/prod/app.env to Terraform as the AWS credentials the backend reads.
terraform {
  backend "s3" {
    bucket = "devopsrockstars-com-terraform-state"
    key    = "terraform.tfstate"
    region = "auto"
    endpoints = {
      s3 = "https://0be508e6c4caa573595c5f94e11900e4.r2.cloudflarestorage.com"
    }
    use_lockfile                = true
    use_path_style              = true
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
  }
}
