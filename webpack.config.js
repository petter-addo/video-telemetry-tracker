const path = require('path');
const Dotenv = require('dotenv-webpack');

module.exports = {
  mode: 'production',
  entry: './src/main.js',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'js'),
    // Ensure compatibility with older JavaScript engines
    environment: {
      arrowFunction: false,
      const: false,
    }
  },
  target: ['web', 'es5'], // Target ES5 for Tizen compatibility
  plugins: [
    new Dotenv({
      systemvars: true,
      safe: false
    })
  ],
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', {
                targets: {
                  // Target Tizen TV browsers
                  browsers: ['chrome >= 47', 'safari >= 9']
                },
                useBuiltIns: 'usage',
                corejs: 3
              }]
            ]
          }
        }
      }
    ]
  },
  devtool: 'source-map',
  resolve: {
    extensions: ['.js']
  }
};
