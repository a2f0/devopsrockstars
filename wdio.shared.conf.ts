export const config: WebdriverIO.Config = {
  autoCompileOpts: {
    autoCompile: true,
    tsNodeOpts: {
      transpileOnly: true,
      project: 'tsconfig.json',
    },
  },
  runner: 'local',
  path: '/',
  specs: ['./e2e/specs/**/*.spec.ts'],
  exclude: [],
  maxInstances: 10,
  capabilities: [
    {
      maxInstances: 5,
      browserName: 'chrome',
    },
  ],
  logLevel: 'info',
  bail: 0,
  baseUrl: 'http://localhost',
  waitforTimeout: 10000,
  connectionRetryTimeout: 90000,
  connectionRetryCount: 3,
  services: ['chromedriver'],
  framework: 'mocha',
  reporters: ['dot', 'spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },
};
