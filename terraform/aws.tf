provider "aws" {
  region = var.aws_region
}

data "aws_route53_zone" "zone" {
  name = var.domain
}

resource "aws_route53_record" "a" {
  allow_overwrite = true
  name            = "${var.host}.${var.domain}"
  ttl             = 60
  type            = "A"
  zone_id         = data.aws_route53_zone.zone.zone_id

  records = [
    "76.76.21.21"
  ]
}
