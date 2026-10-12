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
  async waitForAppReady() {
    const companyLink = await browser.$('a[href="/company"]');
    await companyLink.waitForExist({timeout: 30000});
  }
  // Distance from each footer logo to the bottom of the viewport, once the
  // expected number of logos has been injected.
  async footerLogoGaps(count: number) {
    await browser.waitUntil(() =>
      browser.execute(
        expected => document.querySelectorAll('footer svg').length === expected,
        count
      )
    );
    return browser.execute(() =>
      [...document.querySelectorAll('footer svg')].map(
        svg => innerHeight - svg.getBoundingClientRect().bottom
      )
    );
  }

  static readonly productionOrigin = 'http://localhost:8081';
  static readonly stagingOrigin = 'http://localhost:8082';
}

const BasePage = new Base();

export {Base, BasePage};
