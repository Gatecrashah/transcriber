#ifndef TRANSCRIPER_NATIVE_H
#define TRANSCRIPER_NATIVE_H

#ifdef __cplusplus
extern "C" {
#endif

// C-compatible wrapper for TranscriperNative Swift library
// This provides the interface that Node.js can call via FFI

// Initialize the Swift audio processing system
// Returns: 1 for success, 0 for failure
int transcriper_initialize(void);

// Check if the system is ready for processing
// Returns: 1 if ready, 0 if not ready
int transcriper_is_ready(void);

// Process an audio file and return JSON result
// Parameters:
//   - file_path: Path to audio file to process
//   - result_buffer: Buffer to store JSON result (caller must allocate)
//   - buffer_size: Size of the result buffer
// Returns: Length of result string, or -1 on error
int transcriper_process_audio_file(const char* file_path, char* result_buffer, int buffer_size);

// Process audio buffer data and return JSON result
// Parameters:
//   - audio_data: Raw audio data as float array
//   - data_length: Number of float samples
//   - sample_rate: Sample rate of audio data
//   - channels: Number of audio channels
//   - result_buffer: Buffer to store JSON result
//   - buffer_size: Size of the result buffer
// Returns: Length of result string, or -1 on error
int transcriper_process_audio_buffer(const float* audio_data, int data_length, 
                                   int sample_rate, int channels,
                                   char* result_buffer, int buffer_size);

// Get system information as JSON
// Parameters:
//   - info_buffer: Buffer to store JSON info
//   - buffer_size: Size of the info buffer
// Returns: Length of info string, or -1 on error
int transcriper_get_system_info(char* info_buffer, int buffer_size);

// Get available models as JSON
// Parameters:
//   - models_buffer: Buffer to store JSON models list
//   - buffer_size: Size of the models buffer
// Returns: Length of models string, or -1 on error
int transcriper_get_available_models(char* models_buffer, int buffer_size);

// Cleanup and release resources
void transcriper_cleanup(void);

#ifdef __cplusplus
}
#endif

#endif // TRANSCRIPER_NATIVE_H