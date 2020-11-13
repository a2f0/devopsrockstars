const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: './src/index.tsx',
  output: {
    path: path.resolve(__dirname, 'build'),
    publicPath: '/',
    filename: 'bundle.js'
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx"]
  },
  module: {
    rules: [
      { test: /\.(t|j)sx?$/, use: { loader: 'ts-loader' }, exclude: /node_modules/ },

      { enforce: "pre", test: /\.js$/, exclude: /node_modules/, loader: "source-map-loader" },

      { 
        test: /\.less$/,
        use: [ 
          'style-loader',
          'css-loader', 
          'less-loader',
        ],
      },
      {
        test: /\.svg$/,
        use: ['@svgr/webpack', 'url-loader'],
      }
    ]
  },
  
  // addition - add source-map support
  devtool: "source-map",
  plugins: [
    new HtmlWebpackPlugin({
      template:  path.resolve('./index.html'),
    }),
  ]
};