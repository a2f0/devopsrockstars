import React from 'react';
import {Link} from 'react-router';
import styled from 'styled-components';

const Message = styled.p`
  pointer-events: auto;
`;

// Staging serves the same single-page app without the store or search routes,
// so unmatched paths need somewhere to land instead of an empty page.
const NotFound = React.memo(() => {
  return (
    <>
      <h1>Not found</h1>
      <Message>
        That page is not here. <Link to="/">Return home</Link>.
      </Message>
    </>
  );
});

export default NotFound;
