import React, {useEffect} from 'react';
import styled from 'styled-components';
import skyline from '/static/image/skyline.svg';
import {features} from './environment';
import {prefetchStorefront} from './store/storefrontCache';

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
  useEffect(() => {
    if (!features.store) return;
    const timer = window.setTimeout(() => {
      // The store can retry if this background request fails.
      void prefetchStorefront().catch(() => {});
    }, 500);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <FullScreenSkyline>
      <FillContainerImg src={skyline} alt="skyline" id="skyline" />
    </FullScreenSkyline>
  );
});

export default Skyline;
