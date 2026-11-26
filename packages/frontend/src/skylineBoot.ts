// Shared by the Home skyline and the build that prerenders its loading state,
// so the prerendered silhouette sits exactly where the viewer mounts.

/** Where every build serves the `@a2f0/skyline` viewer assets. */
export const skylineAssetsUrl = '/static/skyline/';

/** The site's dark backdrop, matched by the silhouette and the viewer. */
export const skylineTheme = 'dark';

/** The prerendered loading silhouette on Home, handed to the viewer at mount. */
export const skylinePlaceholderId = 'skyline-placeholder';

/** The skyline's full-viewport frame, behind the page's own content. */
export const skylineFrameStyle =
  'position:fixed;inset:0;width:100%;height:100vh;height:100dvh;z-index:-1337';
