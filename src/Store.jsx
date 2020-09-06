import React, {useEffect, useState} from 'react'
import { StoreProduct } from "./models"

const Store = React.memo(function Store() {

  const [storeProducts, setStoreProducts] = useState([])

  useEffect(() => {
    retrieveEntries();
  }, []);

  const retrieveEntries = () => {
    const fetchData = async () => {
      StoreProduct.includes('store_product_pictures').all().then((response) => {
        setStoreProducts(response.data)
      })
    }
    fetchData();
  }

  return (
    <>
      {storeProducts.map(function(product, i) {
        return (
          <div key={'product-' + product.id}>
            {product.storeProductPictures.map(function(picture, i)  {
              return (
                <div key={'picture-' + picture.id}>
                  {picture.url}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );

});

export default Store
