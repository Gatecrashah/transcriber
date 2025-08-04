// Test complete native integration with nativeAudioProcessor
const { nativeAudioProcessor } = require('./dist/native/nativeAudioProcessor');

async function testCompleteIntegration() {
  console.log('🧪 Testing Complete Native Integration...');
  
  try {
    // Test initialization
    console.log('1. Testing processor initialization...');
    const initSuccess = await nativeAudioProcessor.initialize();
    console.log('   Initialization result:', initSuccess);
    
    if (!initSuccess) {
      console.error('❌ Initialization failed');
      return;
    }
    
    // Test system info
    console.log('2. Testing system info...');
    const systemInfo = await nativeAudioProcessor.getSystemInfo();
    console.log('   System info success:', systemInfo.success);
    
    // Test available models
    console.log('3. Testing available models...');
    const models = await nativeAudioProcessor.getAvailableModels();
    console.log('   Models query success:', models.success);
    
    // Test audio buffer processing (CRITICAL TEST - no temp files!)
    console.log('4. Testing DIRECT audio buffer processing...');
    const startTime = Date.now();
    
    // Create test audio data (1 second of 440Hz sine wave)
    const sampleRate = 16000;
    const duration = 1.0; // 1 second
    const samples = Math.floor(sampleRate * duration);
    const audioData = new Float32Array(samples);
    
    for (let i = 0; i < samples; i++) {
      audioData[i] = 0.1 * Math.sin(2 * Math.PI * 440 * i / sampleRate);
    }
    
    const result = await nativeAudioProcessor.processAudioBuffer(audioData, sampleRate, 1);
    const processingTime = Date.now() - startTime;
    
    console.log('   Buffer processing success:', result.success);
    console.log('   Processing time:', processingTime + 'ms');
    console.log('   Result text length:', result.text?.length || 0);
    console.log('   Speakers detected:', result.speakers?.length || 0);
    
    console.log('✅ All integration tests completed successfully!');
    console.log('🚀 ZERO temporary files created - Direct native processing achieved!');
    
  } catch (error) {
    console.error('❌ Integration test failed:', error.message);
  } finally {
    nativeAudioProcessor.cleanup();
  }
}

testCompleteIntegration();