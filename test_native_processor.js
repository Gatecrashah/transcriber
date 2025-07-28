const { NativeAudioProcessor } = require('./src/native/nativeAudioProcessor.ts');

async function testNativeProcessor() {
  console.log('🧪 Testing Native Audio Processor...');
  
  const processor = new NativeAudioProcessor();
  
  try {
    // Test initialization
    console.log('1️⃣ Testing initialization...');
    const initResult = await processor.initialize();
    console.log('Initialize result:', initResult);
    
    if (!initResult) {
      console.error('❌ Initialization failed');
      return;
    }
    
    // Test getting available models
    console.log('2️⃣ Testing get available models...');
    const models = await processor.getAvailableModels();
    console.log('Available models:', JSON.stringify(models, null, 2));
    
    // Test getting system info (might fail if not fully initialized)
    console.log('3️⃣ Testing get system info...');
    try {
      const systemInfo = await processor.getSystemInfo();
      console.log('System info:', JSON.stringify(systemInfo, null, 2));
    } catch (error) {
      console.log('System info failed (expected):', error.message);
    }
    
    console.log('✅ Native processor test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    processor.cleanup();
  }
}

testNativeProcessor();