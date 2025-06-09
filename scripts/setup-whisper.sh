#!/bin/bash

# Setup script for whisper.cpp integration
set -e

echo "Setting up whisper.cpp for local transcription..."

# Create whisper directory in src/native
mkdir -p src/native/whisper

# Navigate to whisper directory
cd src/native/whisper

# Check if whisper.cpp already exists
if [ ! -d "whisper.cpp" ]; then
    echo "Cloning whisper.cpp repository..."
    git clone https://github.com/ggerganov/whisper.cpp.git
fi

cd whisper.cpp

# Checkout stable version
echo "Checking out stable version v1.7.2..."
git checkout v1.7.2

# Check if build dependencies are installed
if ! command -v cmake &> /dev/null; then
    echo "cmake not found. Please install with: brew install cmake"
    exit 1
fi

if ! command -v ninja &> /dev/null; then
    echo "ninja not found. Please install with: brew install ninja"
    exit 1
fi

# Build whisper.cpp
echo "Building whisper.cpp..."
mkdir -p build
cd build

# Configure with CMake for Release build with Core ML support for Apple Silicon
cmake -G Ninja \
    -DCMAKE_BUILD_TYPE=Release \
    -DWHISPER_COREML=ON \
    -DWHISPER_COREML_ALLOW_FALLBACK=ON \
    ..

# Build
ninja

echo "Building main executable..."
ninja main

echo "whisper.cpp setup complete!"
echo "Main executable location: $(pwd)/bin/main"

# Download a small model for testing
echo "Downloading base model for testing..."
cd ..
if [ ! -f "models/ggml-base.bin" ]; then
    bash ./models/download-ggml-model.sh base
fi

echo "Setup complete! whisper.cpp is ready for integration."