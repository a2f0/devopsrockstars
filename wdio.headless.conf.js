import {config as sharedConfig} from './wdio.shared.conf';

export const config = {
  ...sharedConfig,
  ...{
    capabilities: [
      {
        browserName: 'chrome',
        'goog:chromeOptions': {
          args: [
            '--headless',
            '--disable-gpu',
            '--disable-features=NetworkService',
            '--no-sandbox',
            '--disable-dev-shm-usage',
          ],
        },
      },
    ],
  },
};
