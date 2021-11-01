import React from 'react';
import skyline from '/static/image/skyline.svg';

const Skyline = React.memo(() => {
  return (
    <div className="full-screen-skyline">
      <img
        className="fill-container"
        src={skyline}
        alt="skyline"
        id="skyline"
      />
    </div>
  );
});

export default Skyline;
