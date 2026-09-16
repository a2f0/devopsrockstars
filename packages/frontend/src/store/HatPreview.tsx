import React, {useEffect, useId, useRef, useState} from 'react';
import styled from 'styled-components';
import type {createHatViewer} from './hatViewer';

const Preview = styled.div`
  width: min(100%, 640px);
`;

const Stage = styled.div`
  position: relative;
  aspect-ratio: 612 / 390;

  img, canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  img { object-fit: contain; }
  canvas { cursor: grab; }
  canvas:active { cursor: grabbing; }
  canvas:focus-visible { outline: 1px solid #aaa; outline-offset: 4px; }
  [hidden] { display: none; }
`;

export default function HatPreview({src, name}: {src: string; name: string}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<Awaited<ReturnType<typeof createHatViewer>> | null>(
    null
  );
  const [ready, setReady] = useState(false);
  const instructions = useId();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = new AbortController();
    setReady(false);
    const dispose = () => {
      viewerRef.current?.dispose();
      viewerRef.current = null;
    };
    const contextLost = () => {
      controller.abort();
      dispose();
      setReady(false);
    };
    canvas.addEventListener('webglcontextlost', contextLost);
    const loadArtwork = (path: string) =>
      fetch(path, {signal: controller.signal}).then(response => {
        if (!response.ok) throw new Error('Could not load the hat artwork.');
        return response.text();
      });
    void Promise.all([
      import('./hatViewer'),
      loadArtwork(src),
      loadArtwork('/static/image/store/new-era-flag.svg'),
      loadArtwork('/static/image/store/mlb-batterman.svg'),
    ])
      .then(async ([{createHatViewer}, front, side, rear]) => {
        if (controller.signal.aborted) return;
        const viewer = await createHatViewer(
          canvas,
          {front, side, rear},
          controller.signal
        );
        if (controller.signal.aborted) {
          viewer.dispose();
          return;
        }
        viewerRef.current = viewer;
        setReady(true);
      })
      .catch(error => {
        if (!controller.signal.aborted) {
          console.warn('Using the static hat preview:', error);
          dispose();
        }
      });
    return () => {
      controller.abort();
      canvas.removeEventListener('webglcontextlost', contextLost);
      dispose();
    };
  }, [src]);

  return (
    <Preview>
      <Stage>
        <img src={src} alt={name} hidden={ready} />
        <canvas
          ref={canvasRef}
          style={{visibility: ready ? 'visible' : 'hidden'}}
          tabIndex={ready ? 0 : -1}
          role="img"
          aria-label={`${name}, interactive 3D preview`}
          aria-describedby={ready ? instructions : undefined}
          aria-hidden={!ready}
          onKeyDown={event => {
            const step = Math.PI / 12;
            switch (event.key) {
              case 'ArrowLeft':
                viewerRef.current?.rotate(-step);
                break;
              case 'ArrowRight':
                viewerRef.current?.rotate(step);
                break;
              case 'ArrowUp':
                viewerRef.current?.rotate(0, -step);
                break;
              case 'ArrowDown':
                viewerRef.current?.rotate(0, step);
                break;
              case 'Home':
                viewerRef.current?.reset();
                break;
              default:
                return;
            }
            event.preventDefault();
          }}
        />
      </Stage>
      <span id={instructions} hidden>
        Drag or use arrow keys to rotate. Press Home to reset the view.
      </span>
    </Preview>
  );
}
