import type {Configuration} from 'webpack';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const config: Configuration = {
  entry: './src/index.tsx',
  output: {
    path: path.resolve(__dirname, 'build'),
    publicPath: '/',
    filename: '[name].[contenthash].js',
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
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve('./index.html'),
      minify: false,
      conservativeCollapse: false,
      collapseWhitespace: false,
      preserveLineBreaks: true,
      removeComments: false,
    }),
    new CopyWebpackPlugin({
      patterns: [{from: 'static', to: 'static'}],
    }),
  ],
  experiments: {
    outputModule: true,
  },
};

export default config;
