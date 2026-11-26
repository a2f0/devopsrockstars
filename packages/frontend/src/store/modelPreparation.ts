import {matchesRoute} from '../routes';

/**
 * Which background 3D model a visit builds first when the store is enabled;
 * without the store there is no hat, and the skyline prepares directly.
 * Building the Home skyline and the Store hat at once makes them compete for
 * the main thread and GPU, so startup builds one, then the other: the skyline
 * when the visit starts on Home, where it is the page, and otherwise the hat.
 * Opening the page that shows the waiting model releases it at once.
 *
 * - `skylineFirst`: the hat waits until the skyline settles or the Store opens.
 * - `hatFirst`: the skyline waits until the hat settles or Home opens.
 * - `released`: both prepare freely. It is final, so a later hat retry never
 *   holds the skyline.
 */
export type ModelPreparation =
  | {readonly status: 'skylineFirst'}
  | {readonly status: 'hatFirst'}
  | {readonly status: 'released'};

export type ModelPreparationEvent =
  | {readonly type: 'skylineSettled'}
  | {readonly type: 'hatSettled'}
  | {readonly type: 'routeChanged'; readonly pathname: string};

const homeRoutes = ['/'];
const hatRoutes = ['/store'];

export function initialModelPreparation(pathname: string): ModelPreparation {
  return matchesRoute(homeRoutes, pathname)
    ? {status: 'skylineFirst'}
    : {status: 'hatFirst'};
}

export function transitionModelPreparation(
  preparation: ModelPreparation,
  event: ModelPreparationEvent
): ModelPreparation {
  if (preparation.status === 'released') return preparation;
  switch (event.type) {
    case 'skylineSettled':
      return preparation.status === 'skylineFirst'
        ? {status: 'released'}
        : preparation;
    case 'hatSettled':
      return preparation.status === 'hatFirst'
        ? {status: 'released'}
        : preparation;
    case 'routeChanged': {
      const waitingRoutes =
        preparation.status === 'skylineFirst' ? hatRoutes : homeRoutes;
      return matchesRoute(waitingRoutes, event.pathname)
        ? {status: 'released'}
        : preparation;
    }
    default:
      return assertNever(event);
  }
}

/** Whether the Home skyline may start preparing. */
export function skylineMayPrepare(preparation: ModelPreparation) {
  return preparation.status !== 'hatFirst';
}

/** Whether the Store hat may start preparing. */
export function hatMayPrepare(preparation: ModelPreparation) {
  return preparation.status !== 'skylineFirst';
}

function assertNever(value: never): never {
  throw new Error(
    `Unhandled model preparation event: ${JSON.stringify(value)}`
  );
}
