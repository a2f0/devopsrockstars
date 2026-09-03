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
  open(path: string) {
    return browser.url(`http://localhost:8081/${path}`);
  }
  async waitForAppReady() {
    const companyLink = await browser.$('a[href="/company"]');
    await companyLink.waitForExist({timeout: 30000});
  }
}

const BasePage = new Base();
export {BasePage};
