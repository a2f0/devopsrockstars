
import React, {useEffect, useState} from 'react'
import { ReactSVG } from 'react-svg'

const Company = React.memo(function Company(props) {

  const [grayscale, setGrayscale] = useState(100);

  const techtag = {
    display: "inline-block",
    paddingRight: "4px",
    verticalAlign: "middle",
  };

  interface svgProps {
    backgroundColor: string;
    cursor: string;
    pointerEvents: string;
  }

  return (
    <>
      <h2>
        About Us
      </h2>

      <h2>
        Technologies
      </h2>

      <h3>
        Web
      </h3>


      <div style={{
        cursor: 'pointer',
        pointerEvents: 'auto',
        height: '130px',
        width: '130px',
      }}>
        <ReactSVG
          src='./src/image/tags/aws.svg'
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
