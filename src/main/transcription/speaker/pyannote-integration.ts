import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface PyannoteSegment {
  speaker: string;
  start_time: number;
  end_time: number;
  duration: number;
  confidence: number;
}

export interface PyannoteResult {
  success: boolean;
  speakers?: PyannoteSegment[];
  total_speakers?: number;
  total_segments?: number;
  model_version?: string;
  device_used?: string;
  error?: string;
  error_type?: string;
}

export class PyannoteIntegration {
  private pythonPath: string;
  private scriptPath: string;
  private authToken: string;
  private device: string;

  constructor() {
    // Path to the Python script
    this.scriptPath = path.join(__dirname, 'pyannote-diarization.py');
    
    // Get Python path (try common locations)
    this.pythonPath = this.findPythonPath();
    
    // Get auth token from environment
    this.authToken = process.env.HUGGINGFACE_TOKEN || '';
    if (!this.authToken) {
      console.warn('HUGGINGFACE_TOKEN not found in environment variables');
    }
    
    // Device preference
    this.device = process.env.PYANNOTE_DEVICE || 'cpu';
  }

  private findPythonPath(): string {
    const possiblePaths = [
      'python3',
      'python',
      '/usr/bin/python3',
      '/usr/local/bin/python3',
      '/opt/homebrew/bin/python3'
    ];

    // For development, prefer python3
    return possiblePaths[0];
  }

  async diarizeAudio(audioPath: string): Promise<PyannoteResult> {
    return new Promise((resolve) => {
      if (!this.authToken) {
        resolve({
          success: false,
          error: 'Hugging Face auth token not configured. Please set HUGGINGFACE_TOKEN in .env file',
          error_type: 'AuthenticationError'
        });
        return;
      }

      if (!fs.existsSync(audioPath)) {
        resolve({
          success: false,
          error: `Audio file not found: ${audioPath}`,
          error_type: 'FileNotFoundError'
        });
        return;
      }

      const args = [
        this.scriptPath,
        audioPath,
        '--auth-token', this.authToken,
        '--device', this.device
      ];

      console.log(`Starting pyannote diarization: ${this.pythonPath} ${args.join(' ')}`);

      const pythonProcess = spawn(this.pythonPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result: PyannoteResult = JSON.parse(stdout);
            resolve(result);
          } catch (parseError) {
            resolve({
              success: false,
              error: `Failed to parse Python output: ${parseError}`,
              error_type: 'ParseError'
            });
          }
        } else {
          resolve({
            success: false,
            error: `Python process exited with code ${code}: ${stderr}`,
            error_type: 'ProcessError'
          });
        }
      });

      pythonProcess.on('error', (error) => {
        resolve({
          success: false,
          error: `Failed to start Python process: ${error.message}`,
          error_type: 'SpawnError'
        });
      });

      // Set timeout (5 minutes for typical audio files)
      setTimeout(() => {
        pythonProcess.kill();
        resolve({
          success: false,
          error: 'Pyannote processing timeout (5 minutes)',
          error_type: 'TimeoutError'
        });
      }, 5 * 60 * 1000);
    });
  }

  async checkDependencies(): Promise<{ available: boolean; message: string }> {
    return new Promise((resolve) => {
      const checkProcess = spawn(this.pythonPath, ['-c', 'import pyannote.audio; print("OK")'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let error = '';

      checkProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      checkProcess.stderr.on('data', (data) => {
        error += data.toString();
      });

      checkProcess.on('close', (code) => {
        if (code === 0 && output.includes('OK')) {
          resolve({
            available: true,
            message: 'Pyannote.audio is available'
          });
        } else {
          resolve({
            available: false,
            message: `Pyannote.audio not available: ${error || 'Unknown error'}`
          });
        }
      });

      checkProcess.on('error', () => {
        resolve({
          available: false,
          message: 'Python not found or not executable'
        });
      });
    });
  }

  isConfigured(): boolean {
    return !!this.authToken;
  }
}