import React from 'react';
import styled from 'styled-components';
import {StoreHeading} from './StoreStyles';

const Wordmark = styled.img`
  display: block;
  width: min(100%, 360px);
  height: auto;
`;

const CheckoutHeading = React.memo(() => (
  <StoreHeading>
    <Wordmark
      src="/static/image/store/checkout.svg"
      width={1300}
      height={440}
      alt="checkout"
    />
  </StoreHeading>
));

export default CheckoutHeading;
