import {mountSkyline} from 'chicago-skyline';
import React, {useEffect, useRef} from 'react';
import styled from 'styled-components';
import {features} from './environment';

const skyline = '/static/image/skyline.svg';

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

const InteractiveSkyline = styled(FullScreenSkyline)`
  top: 0;
  height: 100dvh;
  pointer-events: auto;
`;

function Skyline3d() {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current) return;
    const viewer = mountSkyline(container.current, {
      assetsUrl: '/static/skyline/',
    });
    return () => viewer.destroy();
  }, []);
  return <InteractiveSkyline id="skyline" ref={container} />;
}

const Skyline = React.memo(() => {
  if (features.skyline3d) return <Skyline3d />;
  return (
    <FullScreenSkyline>
      <FillContainerImg src={skyline} alt="skyline" id="skyline" />
    </FullScreenSkyline>
  );
});

export default Skyline;
