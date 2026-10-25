import {mountSkyline} from '@a2f0/skyline';
import React, {useEffect, useRef} from 'react';
import styled from 'styled-components';
import {useHatPreviewPreparing} from './store/PreparedHatPreview';

const FullScreenSkyline = styled.div`
  z-index: -1337;
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  pointer-events: auto;
`;

const Skyline = React.memo(() => {
  const container = useRef<HTMLDivElement>(null);
  const preparingHat = useHatPreviewPreparing();
  useEffect(() => {
    // Avoid two expensive model builds competing for CPU/GPU startup time.
    // The viewer mounts once the parked hat settles, including failure.
    if (preparingHat || !container.current) return;
    const viewer = mountSkyline(container.current, {
      assetsUrl: '/static/skyline/',
      // Match the site's dark backdrop while the scene assets load.
      theme: 'dark',
      // Share the hat preview's three.js instead of loading a second engine.
      three: import('@a2f0/skyline/three'),
    });
    // A viewer that can't start says why in its place, logs the error, and
    // keeps the original drawing one press away.
    return () => viewer.destroy();
  }, [preparingHat]);
  return (
    <FullScreenSkyline id="skyline" ref={container} data-ct-app="skyline" />
  );
});

export default Skyline;
