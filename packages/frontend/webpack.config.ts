import path, {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import type {Configuration} from 'webpack';

const __dirname = dirname(fileURLToPath(import.meta.url));

const config: Configuration = {
  entry: path.resolve(__dirname, 'src/index.tsx'),
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
      template: path.resolve(__dirname, 'index.html'),
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
  ],
  experiments: {
    outputModule: true,
  },
};

export default config;
