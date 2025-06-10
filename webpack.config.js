const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
  entry: './src/client/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    sourceMapFilename: '[file].map',
    publicPath: '/'
  },
  mode: 'development',
  devtool: 'inline-source-map',
  resolve: {
    extensions: ['.ts', '.tsx', '.js']
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: {
          loader: 'ts-loader',
          options: {
            compilerOptions: {
              sourceMap: true,
              inlineSources: true,
              sourceRoot: '/'
            }
          }
        },
        exclude: /node_modules/
      },
      {
        test: /\.(png|jpg|jpeg|gif)$/i,
        type: 'asset/resource'
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/client/index.html'
    })
  ],
  devServer: {
    historyApiFallback: true,
    port: 3000,
    proxy: {
      '/api': 'http://localhost:4000'
    },

    static: {
      directory: path.join(__dirname, 'dist')
    },
    devMiddleware: {
      writeToDisk: true
    },
    watchFiles: {
      paths: ['src/**/*'],
      options: {
        usePolling: false
      }
    },
    hot: true
  },
  optimization: {
    minimize: false
  },
  watch: true,
  watchOptions: {
    ignored: /node_modules/,
    aggregateTimeout: 300,
    poll: 1000
  }
}
