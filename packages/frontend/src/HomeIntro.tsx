import React from 'react';
import {siteName} from './pages';

// Rendered into the initial HTML as well as the app. Keep the consulting
// identity readable while the independent skyline loads behind it.
const styles = `
  .home-intro {
    position: absolute;
    top: calc(var(--header-height, 60px) + 24px);
    left: clamp(20px, 5vw, 64px);
    right: 20px;
    color: white;
    font-family: Helvetica, Arial, sans-serif;
    text-shadow: 0 1px 8px black;
    pointer-events: none;
  }

  .home-intro h1 {
    margin: 0;
    font-size: clamp(24px, 5vw, 32px);
    line-height: 1.2;
  }

  .home-intro p {
    margin: 8px 0 0;
    font-size: 18px;
  }

  .home-intro a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: white;
    font-size: 16px;
    pointer-events: auto;
    text-underline-offset: 4px;
  }
`;

export default function HomeIntro() {
  return (
    <section
      className="home-intro"
      aria-labelledby="home-heading"
      data-ct-app="website"
    >
      <style>{styles}</style>
      <h1 id="home-heading">{siteName}</h1>
      <p>DevOps consulting.</p>
      <a href="mailto:info@devopsrockstars.com" data-ct="contact.email">
        info@devopsrockstars.com
      </a>
    </section>
  );
}
