import React from 'react';
import skyline from '/static/image/skyline.svg';
import styled from 'styled-components';

const FullScreenSkyline = styled.div`
  z-index: -1337;
  position: fixed;
  left: 0px;
  right: 0px;
  width: 100vw;
  height: 100vh;
  align-items: flex-end;
  display: flex;
`;

const FillContainerImg = styled.img`
  width: 100%;
  display: block;
`;

const Skyline = React.memo(() => {
  return (
    <FullScreenSkyline>
      <FillContainerImg src={skyline} alt="skyline" id="skyline" />
    </FullScreenSkyline>
  );
});

export default Skyline;
