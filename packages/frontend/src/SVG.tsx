import React, {useState} from 'react';
import {ReactSVG} from 'react-svg';

interface IProps {
  width: number;
  height: number;
  path: string;
  initialGrayscale: number;
}

const SVG = React.memo(({width, height, path, initialGrayscale}: IProps) => {
  const [grayscale, setGrayscale] = useState(initialGrayscale);

  return (
    <div
      id={`${path}`}
      style={{
        cursor: 'arrow',
        pointerEvents: 'auto',
        height: `${width}px`,
        width: `${height}px`,
        display: 'inline-block',
      }}
    >
      <ReactSVG
        src={`${path}`}
        onMouseEnter={() => setGrayscale(100)}
        onMouseLeave={() => setGrayscale(100)}
        beforeInjection={svg => {
          svg.setAttribute('filter', `grayscale(${grayscale}%)`);
        }}
      />
    </div>
  );
});

export default SVG;
