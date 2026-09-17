import React, {useEffect, useId, useRef, useState} from 'react';
import styled, {keyframes} from 'styled-components';
import whiteStar from '/static/image/white-star-only.svg';
import type {createHatViewer} from './hatViewer';

const Preview = styled.div`
  width: min(100%, 640px);
`;

const Stage = styled.div`
  position: relative;
  aspect-ratio: 612 / 390;

  > img, canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  > img { object-fit: contain; }
  canvas { cursor: grab; }
  canvas:active { cursor: grabbing; }
  canvas:focus-visible { outline: 1px solid #aaa; outline-offset: 4px; }
`;

// A sixth of a turn lands the six-pointed mark on the same silhouette.
const turn = keyframes`
  0% { transform: rotate(0deg) scale(0.94); opacity: 0.65; }
  50% { transform: rotate(30deg) scale(1); opacity: 1; }
  100% { transform: rotate(60deg) scale(0.94); opacity: 0.65; }
`;

const PreviewStatus = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 22px;
  color: #aaa;
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
`;

const UnavailableMessage = styled.span`
  position: absolute;
  bottom: 0;
  width: 100%;
  margin: 0;
  color: #aaa;
  font-size: 12px;
`;

const Announcement = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
`;

const LoadingStar = styled.span`
  position: relative;
  display: grid;
  place-items: center;
  width: 104px;
  height: 104px;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border: 1px solid #ffffff24;
    border-radius: 50%;
  }

  img {
    display: block;
    width: 88px;
    height: 88px;
    animation: ${turn} 1.8s ease-in-out infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    img { animation: none; }
  }
`;

export type HatPreviewStatus = 'loading' | 'ready' | 'unavailable';

export default function HatPreview({
  src,
  name,
  onStatusChange,
}: {
  src: string;
  name: string;
  onStatusChange?: (status: HatPreviewStatus) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<Awaited<ReturnType<typeof createHatViewer>> | null>(
    null
  );
  const [status, setStatus] = useState<HatPreviewStatus>('loading');
  const ready = status === 'ready';
  const [announcement, setAnnouncement] = useState('');
  const instructions = useId();

  // Mount an empty live region before filling it, and retain it after loading.
  useEffect(() => {
    setAnnouncement(
      `${name}: ${
        status === 'loading'
          ? 'loading preview.'
          : ready
            ? '3D preview ready.'
            : '3D preview unavailable. Showing a static image.'
      }`
    );
  }, [name, status, ready]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = new AbortController();
    let timeout: number | undefined;
    const updateStatus = (nextStatus: HatPreviewStatus) => {
      if (nextStatus !== 'loading' && timeout !== undefined) {
        window.clearTimeout(timeout);
      }
      setStatus(nextStatus);
      onStatusChange?.(nextStatus);
    };
    updateStatus('loading');
    const dispose = () => {
      viewerRef.current?.dispose();
      viewerRef.current = null;
    };
    const contextLost = () => {
      if (controller.signal.aborted) return;
      controller.abort();
      dispose();
      updateStatus('unavailable');
    };
    canvas.addEventListener('webglcontextlost', contextLost);
    const loadArtwork = (path: string) =>
      fetch(path, {signal: controller.signal}).then(response => {
        if (!response.ok) throw new Error('Could not load the hat artwork.');
        return response.text();
      });
    timeout = window.setTimeout(() => {
      if (controller.signal.aborted) return;
      controller.abort();
      dispose();
      updateStatus('unavailable');
    }, 15_000);
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
        updateStatus('ready');
      })
      .catch(error => {
        if (!controller.signal.aborted) {
          console.warn('Could not load the 3D hat preview:', error);
          updateStatus('unavailable');
          controller.abort();
          dispose();
        }
      });
    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
      canvas.removeEventListener('webglcontextlost', contextLost);
      controller.abort();
      dispose();
    };
  }, [src]);

  return (
    <Preview>
      <Stage>
        {status === 'loading' && (
          <PreviewStatus data-hat-loading aria-hidden="true">
            <LoadingStar>
              <img src={whiteStar} alt="" draggable={false} />
            </LoadingStar>
            <span>Loading hat…</span>
          </PreviewStatus>
        )}
        {status === 'unavailable' && (
          <>
            <img src={src} alt={name} />
            <UnavailableMessage aria-hidden="true">
              3D preview unavailable
            </UnavailableMessage>
          </>
        )}
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
      <Announcement role="status">{announcement}</Announcement>
      <span id={instructions} hidden>
        Drag or use arrow keys to rotate. Press Home to reset the view.
      </span>
    </Preview>
  );
}
