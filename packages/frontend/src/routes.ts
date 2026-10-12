import {matchPath} from 'react-router';

// The registered store pages; other paths under /store render NotFound.
export const storeRoutes = ['/store', '/store/checkout', '/store/receipt'];

// Match like the router, so trailing slashes and unregistered paths agree.
export function matchesRoute(routes: readonly string[], pathname: string) {
  return routes.some(route => matchPath(route, pathname));
}
