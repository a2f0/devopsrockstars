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
  underlinedNavLinks() {
    return browser.execute(() =>
      [...document.querySelectorAll('nav a')]
        .filter(link =>
          getComputedStyle(link).textDecorationLine.includes('underline')
        )
        .map(link => link.getAttribute('href'))
    );
  }
  // Distance from the company logo and the GitHub mark to the bottom of the
  // viewport, once both have been injected.
  async footerLogoGaps() {
    await browser.waitUntil(() =>
      browser.execute(
        () => document.querySelectorAll('footer svg').length === 2
      )
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

  static readonly productionOrigin = 'http://localhost:8081';
  static readonly stagingOrigin = 'http://localhost:8082';
}

const BasePage = new Base();

export {Base, BasePage};
