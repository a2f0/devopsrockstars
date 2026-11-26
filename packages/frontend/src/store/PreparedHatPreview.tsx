import React, {
  createContext,
  type Dispatch,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {createPortal} from 'react-dom';
import {useLocation} from 'react-router';
import {features} from '../featureFlags';
import HatPreview, {type HatPreviewStatus} from './HatPreview';
import {
  hatMayPrepare,
  initialModelPreparation,
  type ModelPreparation,
  type ModelPreparationEvent,
  transitionModelPreparation,
} from './modelPreparation';

const PreparationContext = createContext<{
  preparation: ModelPreparation;
  dispatch: Dispatch<ModelPreparationEvent>;
}>({preparation: {status: 'released'}, dispatch: () => {}});

/**
 * The background models' build order. Without the store there is no hat, so
 * the skyline prepares directly.
 */
export function useModelPreparation() {
  return useContext(PreparationContext);
}

const PreviewContext = createContext<{
  container: HTMLDivElement;
  parking: React.RefObject<HTMLDivElement | null>;
  setPresentation: (value: {name: string; active: boolean}) => void;
} | null>(null);

function PreparedPreview({children}: {children: ReactNode}) {
  const {pathname} = useLocation();
  const [preparation, dispatch] = useReducer(
    transitionModelPreparation,
    pathname,
    initialModelPreparation
  );
  const [container] = useState(() => document.createElement('div'));
  const parking = useRef<HTMLDivElement>(null);
  const [presentation, setPresentation] = useState({
    name: 'Hat',
    active: false,
  });
  const preview = useMemo(
    () => ({container, parking, setPresentation}),
    [container]
  );
  const preparationValue = useMemo(
    () => ({preparation, dispatch}),
    [preparation]
  );

  useEffect(() => {
    dispatch({type: 'routeChanged', pathname});
  }, [pathname]);

  useLayoutEffect(() => {
    // A direct Store visit may already have attached the canvas to its slot.
    if (!container.parentNode) parking.current?.appendChild(container);
    return () => container.remove();
  }, [container]);

  const onStatusChange = useCallback((status: HatPreviewStatus) => {
    if (status !== 'loading') dispatch({type: 'hatSettled'});
  }, []);

  return (
    <PreviewContext.Provider value={preview}>
      {/* Keep a measurable canvas so model construction, texture upload and
          the first GPU render all finish before navigation. Clipping and
          inert keep the parked preview out of view and keyboard navigation. */}
      <div
        ref={parking}
        aria-hidden="true"
        inert
        style={{
          height: 0,
          overflow: 'hidden',
          opacity: 0,
          pointerEvents: 'none',
        }}
      />
      {hatMayPrepare(preparation)
        ? createPortal(
            <HatPreview {...presentation} onStatusChange={onStatusChange} />,
            container
          )
        : null}
      <PreparationContext.Provider value={preparationValue}>
        {children}
      </PreparationContext.Provider>
    </PreviewContext.Provider>
  );
}

export function HatPreviewProvider({children}: {children: ReactNode}) {
  return features.store ? (
    <PreparedPreview>{children}</PreparedPreview>
  ) : (
    children
  );
}

export default function PreparedHatPreview({name}: {name: string}) {
  const preview = useContext(PreviewContext);
  const slot = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!preview) return;
    slot.current?.appendChild(preview.container);
    preview.setPresentation({name, active: true});
    return () => {
      preview.parking.current?.appendChild(preview.container);
      preview.setPresentation({name, active: false});
    };
  }, [preview, name]);

  return <div ref={slot} style={{width: 'min(100%, 640px)'}} />;
}
