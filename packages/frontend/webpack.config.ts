import path, {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import {
  Compilation,
  type Compiler,
  type Configuration,
  DefinePlugin,
  sources,
} from 'webpack';
import 'webpack-dev-server';
import {headersFile, robotsMetaTags, robotsTxt} from './buildAssets';
import {parseSiteEnvironment, siteFeatures} from './src/environment';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The deployment scripts export these; a bare `webpack` build stays on the
// production feature set and talks to the store API same-origin.
const siteEnvironment = parseSiteEnvironment(process.env['PUBLIC_ENVIRONMENT']);
const storeApiOrigin = process.env['STORE_API_ORIGIN'] ?? '';
const features = siteFeatures(siteEnvironment);

class EmitTextAssetsPlugin {
  readonly #assets: Record<string, string>;

  constructor(assets: Record<string, string>) {
    this.#assets = assets;
  }

  apply(compiler: Compiler) {
    compiler.hooks.thisCompilation.tap('EmitTextAssets', compilation => {
      compilation.hooks.processAssets.tap(
        {
          name: 'EmitTextAssets',
          stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
        },
        () => {
          for (const [name, contents] of Object.entries(this.#assets)) {
            compilation.emitAsset(name, new sources.RawSource(contents));
          }
        }
      );
    });
  }
}

const config: Configuration = {
  entry: path.resolve(__dirname, 'src/index.tsx'),
  output: {
    path: path.resolve(__dirname, 'build'),
    publicPath: '/',
    // Wrangler uploads whatever is in the build directory, so a stale bundle
    // from another environment's build must never survive into a deployment.
    clean: true,
    filename: 'assets/[name].[contenthash].js',
    module: true,
    library: {
      type: 'module',
    },
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {loader: 'ts-loader'},
        exclude: /node_modules/,
      },
      {
        test: /\.svg$/,
        use: ['@svgr/webpack', 'url-loader'],
      },
    ],
  },
  devtool: 'source-map',
  devServer: {
    historyApiFallback: true,
    // The store API is a separate Worker in every deployed environment. Proxy
    // it locally so development stays same-origin like the browser tests.
    proxy: [
      {
        context: ['/api'],
        target: process.env['STORE_API_PROXY'] ?? 'http://127.0.0.1:8787',
      },
    ],
  },
  plugins: [
    new DefinePlugin({
      'globalThis.__SITE_ENVIRONMENT__': JSON.stringify(siteEnvironment),
      'globalThis.__STORE_API_ORIGIN__': JSON.stringify(storeApiOrigin),
    }),
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, 'index.html'),
      meta: robotsMetaTags(features),
      scriptLoading: 'module',
      minify: false,
      conservativeCollapse: false,
      collapseWhitespace: false,
      preserveLineBreaks: true,
      removeComments: false,
    }),
    new CopyWebpackPlugin({
      patterns: [{from: path.resolve(__dirname, 'static'), to: 'static'}],
    }),
    new EmitTextAssetsPlugin({
      _headers: headersFile(features),
      'robots.txt': robotsTxt(features),
    }),
  ],
  experiments: {
    outputModule: true,
  },
};

export default config;
