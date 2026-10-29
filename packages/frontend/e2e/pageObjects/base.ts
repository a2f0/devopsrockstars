import {$, browser} from '../browser';

class Base {
  get mapDiv(): ReturnType<WebdriverIO.Browser['$']> {
    return $('#mapdiv');
  }
  get skyline(): ReturnType<WebdriverIO.Browser['$']> {
    return $('#skyline');
  }
  get vCard(): ReturnType<WebdriverIO.Browser['$']> {
    return $('#vCard');
  }
  get repositoryLink(): ReturnType<WebdriverIO.Browser['$']> {
    return $('footer a[aria-label="GitHub repository"]');
  }
  open(path: string) {
    return browser.url(`${Base.productionOrigin}/${path}`);
  }
  // The staging build runs on its own port so one CI run covers both
  // environments' feature flags.
  openStaging(path: string) {
    return browser.url(`${Base.stagingOrigin}/${path}`);
  }
  async waitForSkylineFrame() {
    // The region is aria-busy until the viewer's `ready` settles, and the
    // scene hides its loading indicator at the first frame, not on failure.
    await browser.waitUntil(
      () =>
        browser.execute(selector => {
          const region = document.querySelector(selector);
          const loading = region?.shadowRoot?.querySelector('#loading');
          return (
            region?.hasAttribute('aria-busy') === false &&
            loading instanceof HTMLElement &&
            loading.hidden
          );
        }, Base.skylineRegion),
      {
        timeout: 30000,
        timeoutMsg: 'The shared 3D skyline must render its first frame',
      }
    );
  }
  async waitForAppReady() {
    const companyLink = await browser.$('a[href="/company"]');
    await companyLink.waitForExist({timeout: 30000});
  }
  underlinedNavLinks() {
    return browser.execute(() =>
      [...document.querySelectorAll('nav a')]
        .filter(link =>
          getComputedStyle(link).textDecorationLine.includes('underline')
        )
        .map(link => link.getAttribute('href'))
    );
  }
  headerBackground() {
    return browser.execute(() => {
      const header = document.querySelector('header');
      return header && getComputedStyle(header).backgroundColor;
    });
  }
  // Distance from the company logo and the GitHub mark to the bottom of the
  // viewport, once both have been injected.
  async footerLogoGaps() {
    // Each poll is a WebDriver script, which may take up to its 30-second
    // script timeout while the page's main thread is busy. Under machine load
    // the default 10-second wait failed on a stall that the poll would survive.
    await browser.waitUntil(
      () =>
        browser.execute(
          () => document.querySelectorAll('footer svg').length === 2
        ),
      {timeout: 30000, timeoutMsg: 'The footer logos were not injected'}
    );
    return browser.execute(() => {
      const gap = (selector: string) =>
        innerHeight -
        (document.querySelector(selector)?.getBoundingClientRect().bottom ?? 0);
      return {
        company: gap('footer a[href="/"] svg'),
        repository: gap('footer a[aria-label="GitHub repository"] svg'),
      };
    });
  }

  static readonly skylineRegion = '#skyline > [role="region"]';
  static readonly productionOrigin = 'http://localhost:8081';
  static readonly stagingOrigin = 'http://localhost:8082';
}

const BasePage = new Base();

export {Base, BasePage};
