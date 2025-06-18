// Temporarily disable ForkTsCheckerWebpackPlugin to test if it's causing issues
// import type IForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';

// // eslint-disable-next-line @typescript-eslint/no-var-requires
// const ForkTsCheckerWebpackPlugin: typeof IForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

import CopyWebpackPlugin from 'copy-webpack-plugin';

export const plugins = [
  // new ForkTsCheckerWebpackPlugin({
  //   logger: 'webpack-infrastructure',
  // }),
  new CopyWebpackPlugin({
    patterns: [
      {
        from: 'src/main/transcription/speaker/pyannote-diarization.py',
        to: 'pyannote-diarization.py',
      },
    ],
  }),
];
