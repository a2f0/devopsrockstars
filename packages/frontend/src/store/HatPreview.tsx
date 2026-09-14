import React, {useEffect, useId, useRef, useState} from 'react';
import styled from 'styled-components';
import type {createHatViewer} from './hatViewer';

const Preview = styled.div`
  width: min(100%, 480px);
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

const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  color: #aaa;
  font-size: 12px;

  button {
    min-width: 44px;
    min-height: 36px;
    padding: 6px 10px;
    border: 1px solid #444;
    background: #080808;
    color: #ccc;
    font: inherit;
    cursor: pointer;
  }

  button:hover, button:focus-visible { border-color: white; color: white; }

  @media (max-width: 440px) {
    span { width: 100%; }
  }
`;

export default function HatPreview({src, name}: {src: string; name: string}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<ReturnType<typeof createHatViewer> | null>(null);
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
    void Promise.all([
      import('./hatViewer'),
      fetch(src, {signal: controller.signal}).then(response => {
        if (!response.ok) throw new Error('Could not load the hat artwork.');
        return response.text();
      }),
    ])
      .then(([{createHatViewer}, svg]) => {
        if (controller.signal.aborted) return;
        viewerRef.current = createHatViewer(canvas, svg);
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
      {ready ? (
        <Controls>
          <span id={instructions}>360° · Drag or use arrow keys to rotate</span>
          <button
            type="button"
            aria-label="Rotate hat left"
            onClick={() => viewerRef.current?.rotate(-Math.PI / 4)}
          >
            ←
          </button>
          <button
            type="button"
            aria-label="Rotate hat right"
            onClick={() => viewerRef.current?.rotate(Math.PI / 4)}
          >
            →
          </button>
          <button type="button" onClick={() => viewerRef.current?.reset()}>
            Reset view
          </button>
        </Controls>
      ) : null}
    </Preview>
  );
}
