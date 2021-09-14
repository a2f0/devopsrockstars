import React from 'react'
import skyline from '/static/image/skyline.svg';

const Skyline = React.memo(function Skyline(props) {

  return (
    <div className='full-screen-skyline'>
      <img className='fill-container' src={skyline} alt="skyline" />
    </div>
  );
});

export default Skyline
