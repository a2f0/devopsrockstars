
import React, {useEffect, useState} from 'react'
import { ReactSVG } from 'react-svg'

const Company = React.memo(function Company(props) {

  const [grayscale, setGrayscale] = useState(100);
  interface svgProps {
    backgroundColor: string;
    cursor: string;
    pointerEvents: string;
  }

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
      <div style={{
        cursor: 'pointer',
        pointerEvents: 'auto',
        height: '100px',
        width: '100px',
      }}>
        <ReactSVG
          src='/static/image/tags/aws.svg'
          onMouseEnter={() => setGrayscale(0)}
          onMouseLeave={() => setGrayscale(100)}
          beforeInjection={(svg) => {
            svg.setAttribute('filter', `grayscale(${grayscale}%)`);
          }}
        />
      </div>
    </>
  );
});

export default Company
