// Test Koffi basic loading
const koffi = require('koffi');

console.log('Koffi object:', typeof koffi);
console.log('Koffi.load function:', typeof koffi.load);
console.log('Available methods:', Object.getOwnPropertyNames(koffi));

if (typeof koffi.load === 'function') {
  console.log('✅ koffi.load is available');
} else {
  console.log('❌ koffi.load is not available');
}