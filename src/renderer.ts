import './index.css';

interface UIElements {
  recordBtn: HTMLButtonElement;
  stopBtn: HTMLButtonElement;
  status: HTMLElement;
  transcriptionOutput: HTMLElement;
  debugOutput: HTMLElement;
  levelBar: HTMLElement;
}

class PoCApp {
  private elements: UIElements;
  private isRecording = false;

  constructor() {
    this.elements = this.getUIElements();
    this.setupEventListeners();
    this.updateStatus('Ready - PoC Interface Loaded');
    this.logDebug('PoC App initialized');
    this.initializeAudio();
  }

  private async initializeAudio(): Promise<void> {
    try {
      this.logDebug('Initializing audio system...');
      const result = await window.electronAPI.audio.initialize();
      
      if (result.success) {
        this.logDebug('Audio system initialized successfully');
        this.updateStatus('Audio system ready');
      } else {
        this.logDebug(`Audio initialization failed: ${result.error}`);
        this.updateStatus('Audio system error');
      }
    } catch (error) {
      this.logDebug(`Audio initialization error: ${error}`);
      this.updateStatus('Audio system error');
    }
  }

  private getUIElements(): UIElements {
    return {
      recordBtn: document.getElementById('recordBtn') as HTMLButtonElement,
      stopBtn: document.getElementById('stopBtn') as HTMLButtonElement,
      status: document.getElementById('status') as HTMLElement,
      transcriptionOutput: document.getElementById('transcriptionOutput') as HTMLElement,
      debugOutput: document.getElementById('debugOutput') as HTMLElement,
      levelBar: document.getElementById('levelBar') as HTMLElement,
    };
  }

  private setupEventListeners(): void {
    this.elements.recordBtn.addEventListener('click', () => this.startRecording());
    this.elements.stopBtn.addEventListener('click', () => this.stopRecording());
  }

  private async startRecording(): Promise<void> {
    try {
      this.logDebug('Starting recording...');
      this.updateStatus('Starting recording...');
      
      const result = await window.electronAPI.audio.startRecording();
      
      if (result.success) {
        this.isRecording = true;
        this.elements.recordBtn.disabled = true;
        this.elements.stopBtn.disabled = false;
        this.updateStatus('Recording system audio...');
        
        // Clear previous transcription
        this.elements.transcriptionOutput.innerHTML = '<p class="placeholder">Listening for audio...</p>';
        
        this.logDebug('Recording started successfully');
        
        // Start audio level monitoring
        this.startAudioLevelMonitoring();
      } else {
        this.logDebug(`Failed to start recording: ${result.error}`);
        this.updateStatus(`Recording error: ${result.error}`);
      }
      
    } catch (error) {
      this.logDebug(`Error starting recording: ${error}`);
      this.updateStatus('Error starting recording');
    }
  }

  private async stopRecording(): Promise<void> {
    try {
      this.logDebug('Stopping recording...');
      this.updateStatus('Stopping recording...');
      
      const result = await window.electronAPI.audio.stopRecording();
      
      if (result.success) {
        this.isRecording = false;
        this.elements.recordBtn.disabled = false;
        this.elements.stopBtn.disabled = true;
        this.updateStatus('Processing audio for transcription...');
        
        // Reset audio level
        this.elements.levelBar.style.width = '0%';
        
        this.logDebug(`Recording stopped successfully. Audio file: ${result.audioPath}`);
        
        // TODO: Process transcription with the audio file
        setTimeout(() => {
          this.displayTranscription(`Audio recorded successfully!\nFile: ${result.audioPath}\n\nTranscription will be implemented in the next step.`);
          this.updateStatus('Ready');
        }, 1000);
      } else {
        this.logDebug(`Failed to stop recording: ${result.error}`);
        this.updateStatus(`Stop recording error: ${result.error}`);
        this.isRecording = false;
        this.elements.recordBtn.disabled = false;
        this.elements.stopBtn.disabled = true;
      }
      
    } catch (error) {
      this.logDebug(`Error stopping recording: ${error}`);
      this.updateStatus('Error stopping recording');
      this.isRecording = false;
      this.elements.recordBtn.disabled = false;
      this.elements.stopBtn.disabled = true;
    }
  }

  private startAudioLevelMonitoring(): void {
    this.updateAudioLevel();
  }

  private async updateAudioLevel(): Promise<void> {
    if (!this.isRecording) return;
    
    try {
      const result = await window.electronAPI.audio.getLevel();
      if (result.success && result.level !== undefined) {
        this.elements.levelBar.style.width = `${result.level}%`;
      }
    } catch (error) {
      // Silently handle level monitoring errors
    }
    
    // Continue monitoring if still recording
    if (this.isRecording) {
      setTimeout(() => this.updateAudioLevel(), 100);
    }
  }

  private displayTranscription(text: string): void {
    this.elements.transcriptionOutput.innerHTML = `<p>${text}</p>`;
    this.logDebug(`Transcription received: ${text}`);
  }

  private updateStatus(message: string): void {
    this.elements.status.textContent = message;
  }

  private logDebug(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.textContent = `[${timestamp}] ${message}`;
    this.elements.debugOutput.appendChild(logEntry);
    this.elements.debugOutput.scrollTop = this.elements.debugOutput.scrollHeight;
    console.log(`[PoC] ${message}`);
  }
}

// Initialize the PoC app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PoCApp();
});
