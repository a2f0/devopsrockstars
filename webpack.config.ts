import {Configuration} from 'webpack';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import {dirname} from 'path';
import {fileURLToPath} from 'url';
import path from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const config: Configuration = {
  entry: './src/index.tsx',
  output: {
    path: path.resolve(__dirname, 'build'),
    publicPath: '/',
    filename: 'bundle.js',
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
    }),
    new CopyWebpackPlugin({
      patterns: [{from: 'static', to: 'static'}],
    }),
  ],
};

export default config;
