import React, {useEffect} from 'react'
import { StoreProduct } from "./models"

const Store = React.memo(function Store() {

  useEffect(() => {
    retrieveEntries();
  });

  const retrieveEntries = () => {
    const fetchData = async () => {
      StoreProduct.all()
    }
    fetchData();
  }


  return (
    <h2>Store</h2>
  );

});

export default Store
