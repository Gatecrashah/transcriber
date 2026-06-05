import ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';

// ts-loader runs with transpileOnly for speed; this plugin performs the actual
// type-checking in a separate process and fails the build on type errors.
export const plugins = [
  new ForkTsCheckerWebpackPlugin({
    logger: 'webpack-infrastructure',
  }),
];
