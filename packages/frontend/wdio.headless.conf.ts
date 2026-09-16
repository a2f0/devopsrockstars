import {config as sharedConfig} from './wdio.shared.conf';

export const config: WebdriverIO.Config = {
  ...sharedConfig,
  // SwiftShader uses CPU workers for each browser's graphics context. Run
  // specs serially so concurrent hat previews do not starve page interaction
  // and shader compilation on the smaller CI runners.
  maxInstances: 1,
  ...{
    capabilities: [
      {
        browserName: 'chrome',
        'goog:chromeOptions': {
          // If this is undefined it will default to launching Chrome from the existing path.
          // See .github/workflows/main.yml for a deterministic configuration of this value.
          args: [
            '--headless',
            // Exercise the 3D preview deterministically on CI without a GPU.
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--disable-features=NetworkService',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--window-size=1366,2160',
          ],
        },
      },
    ],
  },
};
