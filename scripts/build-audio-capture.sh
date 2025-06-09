#!/bin/bash

# Build script for Swift audio capture utility

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SWIFT_SRC_DIR="$PROJECT_DIR/src/native/swift"
BUILD_DIR="$PROJECT_DIR/build"
OUTPUT_BINARY="$BUILD_DIR/audio-capture"

echo "Building Swift audio capture utility..."

# Create build directory
mkdir -p "$BUILD_DIR"

# Check if we're on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "Error: This audio capture utility only works on macOS"
    exit 1
fi

# Check if Swift is available
if ! command -v swift &> /dev/null; then
    echo "Error: Swift compiler not found. Please install Xcode or Swift toolchain."
    exit 1
fi

# Compile Swift files
echo "Compiling Swift source files..."
swiftc \
    -target arm64-apple-macos14.4 \
    -framework Foundation \
    -framework CoreAudio \
    -framework AudioToolbox \
    -framework AVFoundation \
    -framework OSLog \
    -O \
    -o "$OUTPUT_BINARY" \
    "$SWIFT_SRC_DIR/AudioCapture.swift" \
    "$SWIFT_SRC_DIR/main.swift"

# Make the binary executable
chmod +x "$OUTPUT_BINARY"

echo "Build completed successfully!"
echo "Binary location: $OUTPUT_BINARY"

# Test the binary
echo "Testing binary..."
if "$OUTPUT_BINARY" check-permissions; then
    echo "Audio capture utility built and tested successfully!"
else
    echo "Warning: Audio permissions not granted. The utility was built successfully but needs permissions to work."
fi