import React, {useEffect, useState} from 'react'
import { StoreProduct } from "./models"
import { makeStyles } from '@material-ui/core/styles';
import FlexContainerRow from "./shared/FlexContainerRow.jsx"
import { ReactSVG } from 'react-svg'

const useStyles = makeStyles(() => ({	
  storeItem: {	
    display: 'flex',
    justifyContent: 'center',
    flexDirection: 'row',
    width: '100%',
  },
  storePicture: {	
    marginTop: 75,
    display: 'flex'
  },
}));

const Store = React.memo(function Store() {

  const classes = useStyles();
  const [storeProducts, setStoreProducts] = useState([] as StoreProduct[])

  useEffect(() => {
    retrieveEntries();
  }, []);

  const retrieveEntries = () => {
    const fetchData = async () => {
      StoreProduct.includes('store_product_pictures').all().then((response) => {
        console.info(response.data)
        setStoreProducts(response.data)
      })
    }
    fetchData();
  }

  return (
    <>
      {storeProducts.map(function(product, i) {
        return (
          <div key={'product-' + product.id} className={classes.storeItem}>
            {product.storeProductPictures.map(function(picture, i)  {
              return (
                <div key={'picture-' + picture.id} className={classes.storePicture}>
                  <ReactSVG
                      src={picture.fullUrl}
                      beforeInjection={(svg) => {
                        svg.classList.add('svg-class-name')
                        svg.setAttribute('style', 'width: 270px')
                      }}/>
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
