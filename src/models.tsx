import {
  Model,
  SpraypaintBase,
  Attr,
} from "spraypaint"

@Model()
class ApplicationRecord extends SpraypaintBase {
  static baseUrl = "http://localhost:3000"
  static apiNamespace = "/api/v1"
}

@Model()
export class StoreProduct extends ApplicationRecord {
  static jsonapiType = "store_products"
  @Attr() firstName: string
}
