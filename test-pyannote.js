#!/usr/bin/env node

/**
 * Test script for pyannote integration
 * Run with: node test-pyannote.js
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

async function testPyannoteIntegration() {
  console.log('🧪 Testing Pyannote Integration...\n');
  
  // Check if .env file exists
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.log('❌ .env file not found. Please create .env file with HUGGINGFACE_TOKEN');
    console.log('📝 Copy .env.example to .env and add your Hugging Face token');
    return;
  }
  
  // Test Python availability
  console.log('1. Testing Python availability...');
  try {
    const pythonProcess = spawn('python3', ['--version'], { stdio: 'pipe' });
    
    let output = '';
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    await new Promise((resolve) => {
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ Python available: ${output.trim()}`);
        } else {
          console.log('❌ Python3 not found');
        }
        resolve();
      });
    });
  } catch (error) {
    console.log('❌ Error checking Python:', error.message);
  }
  
  // Test pyannote.audio availability
  console.log('\n2. Testing pyannote.audio availability...');
  try {
    const pyannoteCheck = spawn('python3', ['-c', 'import pyannote.audio; print("pyannote.audio available")'], { stdio: 'pipe' });
    
    let output = '';
    let error = '';
    
    pyannoteCheck.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    pyannoteCheck.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    await new Promise((resolve) => {
      pyannoteCheck.on('close', (code) => {
        if (code === 0) {
          console.log('✅ pyannote.audio is available');
        } else {
          console.log('❌ pyannote.audio not available');
          console.log('   Install with: pip install pyannote.audio');
          if (error) {
            console.log('   Error:', error.trim());
          }
        }
        resolve();
      });
    });
  } catch (error) {
    console.log('❌ Error checking pyannote.audio:', error.message);
  }
  
  // Test PyTorch availability
  console.log('\n3. Testing PyTorch availability...');
  try {
    const torchCheck = spawn('python3', ['-c', 'import torch; print(f"PyTorch {torch.__version__} available")'], { stdio: 'pipe' });
    
    let output = '';
    let error = '';
    
    torchCheck.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    torchCheck.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    await new Promise((resolve) => {
      torchCheck.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ ${output.trim()}`);
        } else {
          console.log('❌ PyTorch not available');
          console.log('   Install with: pip install torch');
          if (error) {
            console.log('   Error:', error.trim());
          }
        }
        resolve();
      });
    });
  } catch (error) {
    console.log('❌ Error checking PyTorch:', error.message);
  }
  
  // Test our Python script
  console.log('\n4. Testing our pyannote script...');
  const scriptPath = path.join(__dirname, 'src', 'main', 'transcription', 'speaker', 'pyannote-diarization.py');
  
  if (fs.existsSync(scriptPath)) {
    console.log('✅ Pyannote script found at:', scriptPath);
    
    // Test script help
    try {
      const helpProcess = spawn('python3', [scriptPath, '--help'], { stdio: 'pipe' });
      
      let output = '';
      helpProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      await new Promise((resolve) => {
        helpProcess.on('close', (code) => {
          if (code === 0) {
            console.log('✅ Script help works correctly');
          } else {
            console.log('❌ Script help failed');
          }
          resolve();
        });
      });
    } catch (error) {
      console.log('❌ Error testing script:', error.message);
    }
  } else {
    console.log('❌ Pyannote script not found');
  }
  
  console.log('\n🎯 Next Steps:');
  console.log('1. If pyannote.audio is missing: pip install pyannote.audio');
  console.log('2. Create .env file with your HUGGINGFACE_TOKEN');
  console.log('3. Get token from: https://huggingface.co/settings/tokens');
  console.log('4. Test with actual audio file using the enhanced transcription pipeline');
}

testPyannoteIntegration().catch(console.error);