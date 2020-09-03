import React, {useEffect, useState} from 'react'
import { StoreProduct } from "./models"

const Store = React.memo(function Store() {

  const [storeProducts, setStoreProducts] = useState([])

  useEffect(() => {
    retrieveEntries();
  }, []);

  const retrieveEntries = () => {
    const fetchData = async () => {
      let response = await StoreProduct.includes('store_product_pictures').all()
      setStoreProducts(response.data)
    }
    fetchData();
  }


  return (
    <>
      <h2>Store</h2>
      {storeProducts.map(function(product, index){
        return (
          <div key={'product' + product.id}>
          </div>
        )
      })}
    </>
  );

});

export default Store
