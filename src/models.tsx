
import {
  Model,
  SpraypaintBase,
  Attr,
  HasMany,
  BelongsTo,
} from "spraypaint"

export const baseHTTPURL = () => {
  if (window.location.hostname === 'esor.devopsrockstars.com') {
    return 'https://rose.devopsrockstars.com';
  } else if (window.location.hostname === 'axl.devopsrockstars.com') {
    return 'https://devopsrockstars.com';
  } else {
    return 'http://localhost:3000';
  }
}


@Model()
class ApplicationRecord extends SpraypaintBase {
  static baseUrl = baseHTTPURL()
  static apiNamespace = "/api/v1"
}

@Model()
export class StoreProductPicture extends ApplicationRecord {
  static jsonapiType = "store_product_pictures"
  @Attr url: string

  get fullUrl() {
    return `${baseHTTPURL()}${this.url}`
  }

  @BelongsTo() storeProduct: StoreProduct
}

@Model()
export class StoreProduct extends ApplicationRecord {
  static jsonapiType = "store_products"
  @HasMany() storeProductPictures: StoreProductPicture[]
}

@Model()
export class TechtagSection extends ApplicationRecord {
  @Attr title: string
  static jsonapiType = "techtag_sections"
  @HasMany() techtags: Techtag[]
}

@Model()
export class Techtag extends ApplicationRecord {
  @Attr url: string
  get fullUrl() {
    return `${baseHTTPURL()}${this.url}`
  }
  static jsonapiType = "techtags"
}
