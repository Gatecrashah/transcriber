import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export interface AudioDevice {
  id: string;
  name: string;
  type: 'input' | 'output';
}

export interface AudioConfig {
  sampleRate: number;
  channels: number;
  format: string;
}

export class AudioManager {
  private isRecording = false;
  private audioProcess: ChildProcess | null = null;
  private audioLevel = 0;
  private outputPath: string;
  private audioCallback?: (audioData: Buffer) => void;
  private audioCaptureUtility: string;

  constructor(outputDir = '/tmp') {
    this.outputPath = path.join(outputDir, 'transcriper_audio.wav');
    // Path to our Swift audio capture utility - use process.cwd() to get project root
    this.audioCaptureUtility = path.join(process.cwd(), 'build/audio-capture');
  }

  async initialize(): Promise<boolean> {
    try {
      // Check if our Swift audio capture utility exists
      if (!fs.existsSync(this.audioCaptureUtility)) {
        console.error('Audio capture utility not found. Please run build script first.');
        return false;
      }

      // Test permissions
      const { stdout } = await execAsync(`"${this.audioCaptureUtility}" check-permissions`);
      if (stdout.trim() === 'Permissions granted') {
        console.log('AudioManager initialized successfully with permissions');
        return true;
      } else {
        console.error('Audio permissions not granted');
        return false;
      }
    } catch (error) {
      console.error('Error initializing audio manager:', error);
      return false;
    }
  }

  async getAudioDevices(): Promise<AudioDevice[]> {
    try {
      // Use system_profiler to get audio devices on macOS
      const { stdout } = await execAsync('system_profiler SPAudioDataType -json');
      const data = JSON.parse(stdout);
      
      const devices: AudioDevice[] = [];
      
      // Parse macOS audio device data
      if (data.SPAudioDataType) {
        data.SPAudioDataType.forEach((device: any) => {
          if (device._name) {
            devices.push({
              id: device._name,
              name: device._name,
              type: 'input' // Simplified for PoC
            });
          }
        });
      }
      
      return devices;
    } catch (error) {
      console.error('Error getting audio devices:', error);
      return [{ id: 'default', name: 'Default Audio Device', type: 'input' }];
    }
  }

  async startRecording(): Promise<boolean> {
    if (this.isRecording) {
      return false;
    }

    try {
      console.log('Starting audio recording with Swift utility...');
      
      // Start the Swift audio capture utility
      this.audioProcess = spawn(this.audioCaptureUtility, ['start'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.audioProcess.stdout?.on('data', (data) => {
        console.log('Audio capture output:', data.toString());
        this.updateAudioLevel();
      });

      this.audioProcess.stderr?.on('data', (data) => {
        console.log('Audio capture error:', data.toString());
      });

      this.audioProcess.on('error', (error) => {
        console.error('Audio recording error:', error);
        this.isRecording = false;
      });

      this.audioProcess.on('close', (code) => {
        console.log(`Audio recording process exited with code ${code}`);
        this.isRecording = false;
      });

      this.isRecording = true;
      
      // Give the process a moment to start
      await new Promise(resolve => setTimeout(resolve, 500));
      
      return true;

    } catch (error) {
      console.error('Error starting recording:', error);
      return false;
    }
  }

  async stopRecording(): Promise<boolean> {
    if (!this.isRecording || !this.audioProcess) {
      return false;
    }

    try {
      // Use the stop command to gracefully stop recording
      const stopProcess = spawn(this.audioCaptureUtility, ['stop'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let outputPath: string | null = null;

      stopProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        console.log('Stop output:', output);
        
        // Extract file path from output
        const match = output.match(/File saved to: (.+)/);
        if (match) {
          outputPath = match[1];
        }
      });

      stopProcess.on('close', (code) => {
        console.log(`Stop process exited with code ${code}`);
        
        // Process the recorded file if we got a path
        if (outputPath && fs.existsSync(outputPath)) {
          this.outputPath = outputPath;
          const audioData = fs.readFileSync(outputPath);
          this.audioCallback?.(audioData);
        }
      });

      // Also signal the recording process to stop
      this.audioProcess.kill('SIGTERM');
      this.isRecording = false;
      this.audioLevel = 0;
      
      // Wait for processes to finish
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return true;
    } catch (error) {
      console.error('Error stopping recording:', error);
      return false;
    }
  }

  private updateAudioLevel(): void {
    // Simulate audio level for PoC
    this.audioLevel = Math.random() * 100;
  }

  getAudioLevel(): number {
    return this.audioLevel;
  }

  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  setAudioCallback(callback: (audioData: Buffer) => void): void {
    this.audioCallback = callback;
  }

  getOutputPath(): string {
    return this.outputPath;
  }

  cleanup(): void {
    if (this.isRecording) {
      this.stopRecording();
    }
    
    // Clean up temporary files
    if (fs.existsSync(this.outputPath)) {
      try {
        fs.unlinkSync(this.outputPath);
      } catch (error) {
        console.error('Error cleaning up audio file:', error);
      }
    }
  }
}