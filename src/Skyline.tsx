import React from 'react'
import skylineUrl from './image/chicago_skyline.svg';

const Skyline = React.memo(function Skyline(props) {

  return (
    <div className='full-screen'>
      <img className='fill-container' src={skylineUrl} alt="skyline" />
    </div>
  );
});

export default Skyline
