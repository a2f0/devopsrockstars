import React, {useState} from 'react';
import { ReactSVG } from 'react-svg';

interface IProps {
  width: number;
  height: number;
  path: string;
}

const SVG = React.memo(function SVG({width, height, path}: IProps) {

  const [grayscale, setGrayscale] = useState(100);

  return (

    <div style={{
      cursor: 'arrow',
      pointerEvents: 'auto',
      height: `${width}px`,
      width: `${height}px`,
      display: 'inline-block',
    }}>
      <ReactSVG
        src={`${path}`}
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
