// Simple test script for Swift native bridge
const { SwiftNativeBridge } = require('./dist/swiftNativeBridge');

async function testSwiftIntegration() {
  console.log('🧪 Testing Swift Native Bridge Integration...');
  
  try {
    // Test initialization
    console.log('1. Testing initialization...');
    const initResult = await SwiftNativeBridge.runCommand({ command: ['init'] });
    console.log('Init result:', initResult);
    
    if (!initResult.success) {
      console.error('❌ Initialization failed');
      return;
    }
    
    // Test system info
    console.log('2. Testing system info...');
    const infoResult = await SwiftNativeBridge.runCommand({ command: ['system-info'] });
    console.log('System info result:', infoResult);
    
    // Test available models
    console.log('3. Testing available models...');
    const modelsResult = await SwiftNativeBridge.runCommand({ command: ['models'] });
    console.log('Models result:', modelsResult);
    
    // Test audio buffer processing (with dummy data)
    console.log('4. Testing audio buffer processing...');
    const dummyAudioData = new Float32Array(1000); // 1000 samples of silence
    for (let i = 0; i < dummyAudioData.length; i++) {
      dummyAudioData[i] = 0.01 * Math.sin(2 * Math.PI * 440 * i / 16000); // 440Hz sine wave
    }
    
    const bufferResult = await SwiftNativeBridge.processAudioBuffer(dummyAudioData, 16000, 1);
    console.log('Buffer processing result:', bufferResult);
    
    console.log('✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    SwiftNativeBridge.cleanup();
  }
}

// Run the test
testSwiftIntegration();