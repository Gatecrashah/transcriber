import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './components/App';

// Import all styles
import './styles/app.css';
import './styles/notepad.css';
import './styles/transcription-panel.css';

console.log('React renderer starting...');

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

console.log('Creating React root...');
const root = createRoot(container);

console.log('Rendering React app...');
root.render(<App />);