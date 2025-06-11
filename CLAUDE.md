# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Electron application called "transcriper" built with TypeScript and Webpack. The application uses Electron Forge for building, packaging, and distribution.

## Key Architecture

- **Main Process**: `src/index.ts` - Entry point for the Electron main process
- **Renderer Process**: `src/renderer.ts` - Frontend code that runs in the browser window
- **Preload Script**: `src/preload.ts` - Bridge between main and renderer processes (currently minimal)
- **HTML Entry**: `src/index.html` - Main application window template
- **Styling**: `src/index.css` - Application styles

The application uses the standard Electron multi-process architecture with Webpack bundling via Electron Forge's WebpackPlugin.

## Development Commands

- `npm start` - Start the application in development mode with hot reload
- `npm run lint` - Run ESLint on TypeScript files
- `npm run package` - Package the application for distribution
- `npm run make` - Create distributable installers for the current platform
- `npm run publish` - Publish the application

## Build Configuration

- Uses Electron Forge with Webpack plugin for bundling
- TypeScript compilation with target ES6
- Webpack configs split into main (`webpack.main.config.ts`) and renderer (`webpack.renderer.config.ts`)
- Security fuses enabled for production builds (ASAR encryption, node isolation)
- Multi-platform makers: Squirrel (Windows), ZIP (macOS), DEB/RPM (Linux)

## Security Configuration

The application has several security features enabled via Electron Fuses:
- ASAR integrity validation
- Cookie encryption
- Node.js integration disabled in renderer
- App only loads from ASAR in production