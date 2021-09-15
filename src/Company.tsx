
import React, {useState} from 'react';
import SVG from './SVG';

const Company = React.memo(function Company(props) {

  const [grayscale, setGrayscale] = useState(100);

  return (
    <>
      <h1>
        About Us
      </h1>

      <p>
        We are a consultancy offering services in DevOps and development.
      </p>

      <h1>
        Technologies
      </h1>
      <SVG height={100} width={100} />
    </>
  );
});

export default Company
