import React, {useState} from 'react';
import { ReactSVG } from 'react-svg';

interface IProps {
  width: number;
  height: number;
}

const SVG = React.memo(function SVG({width, height}: IProps) {

  const [grayscale, setGrayscale] = useState(100);

  return (

    <div style={{
      cursor: 'arrow',
      pointerEvents: 'auto',
      height: `${width}px`,
      width: `${height}px`,
    }}>
      <ReactSVG
        src='/static/image/tags/aws.svg'
        onMouseEnter={() => setGrayscale(100)}
        onMouseLeave={() => setGrayscale(100)}
        beforeInjection={(svg) => {
          svg.setAttribute('filter', `grayscale(${grayscale}%)`);
        }}
      />
    </div>
  )
});

export default SVG;
