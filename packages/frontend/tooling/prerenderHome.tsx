import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import HomeIntro, {homeIntroStyles} from '../src/HomeIntro';

// Only this small introduction is rendered at build time.
// The client replaces it with the same component when the app starts;
// the server renderer stays out of the browser bundle, and this build path
// never imports or constructs the skyline scene.
export function prerenderHome() {
  return {html: renderToStaticMarkup(<HomeIntro />), styles: homeIntroStyles};
}
