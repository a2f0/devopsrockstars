import {mountSkyline, type SkylineInstance} from '@a2f0/skyline';
import React, {useEffect, useRef, useState} from 'react';
import {useLocation} from 'react-router';
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
  const viewer = useRef<SkylineInstance | null>(null);
  const [settled, setSettled] = useState(false);
  const {pathname} = useLocation();
  const active = pathname === '/';
  const preparingHat = useHatPreviewPreparing();
  useEffect(() => {
    // Only initial startup waits for the hat; a later hat retry must not
    // destroy an already prepared skyline.
    if (preparingHat || viewer.current || !container.current) return;
    const instance = mountSkyline(container.current, {
      assetsUrl: '/static/skyline/',
      // Match the site's dark backdrop while the scene assets load.
      theme: 'dark',
      // Share the hat preview's three.js instead of loading a second engine.
      three: import('@a2f0/skyline/three'),
    });
    viewer.current = instance;
    // Failure still leaves the viewer's explanation and original drawing
    // available on Home. Ignore completion from a cleaned-up instance.
    const finish = () => {
      if (viewer.current === instance) setSettled(true);
    };
    void instance.ready.then(finish, finish);
  }, [preparingHat]);
  useEffect(
    () => () => {
      viewer.current?.destroy();
      viewer.current = null;
    },
    []
  );
  return (
    <FullScreenSkyline
      id="skyline"
      ref={container}
      data-ct-app="skyline"
      aria-hidden={!active}
      inert={!active}
      // Prepare at viewport size, then remove the parked viewer from layout:
      // its ResizeObserver pauses the turntable without losing GPU resources.
      hidden={!active && settled}
      style={{visibility: active ? 'visible' : 'hidden'}}
    />
  );
});

export default Skyline;
