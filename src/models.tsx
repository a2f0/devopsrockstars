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
  @BelongsTo() storeProduct: StoreProduct
}

@Model()
export class StoreProduct extends ApplicationRecord {
  static jsonapiType = "store_products"
  @HasMany() storeProductPictures: StoreProductPicture[]
}
