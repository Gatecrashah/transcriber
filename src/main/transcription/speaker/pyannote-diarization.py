#!/usr/bin/env python3
"""
Pyannote Speaker Diarization Script for Transcriper
Integrates with Node.js via child_process.spawn()
"""

import sys
import json
import argparse
import os
from pathlib import Path

try:
    from pyannote.audio import Pipeline
    import torch
except ImportError as e:
    print(json.dumps({"error": f"Missing dependencies: {e}"}), flush=True)
    sys.exit(1)

def process_audio(audio_path, auth_token, model_version="3.1", device="cpu"):
    """
    Process audio file with pyannote speaker diarization
    
    Args:
        audio_path: Path to audio file
        auth_token: Hugging Face auth token
        model_version: Pipeline version (default: 3.1)
        device: Processing device (cpu/cuda)
    
    Returns:
        JSON formatted diarization results
    """
    try:
        # Initialize pipeline
        pipeline_name = f"pyannote/speaker-diarization-{model_version}"
        pipeline = Pipeline.from_pretrained(
            pipeline_name,
            use_auth_token=auth_token
        )
        
        # Move to GPU if available and requested
        if device == "cuda" and torch.cuda.is_available():
            pipeline = pipeline.to(torch.device("cuda"))
        elif device == "mps" and torch.backends.mps.is_available():
            pipeline = pipeline.to(torch.device("mps"))
        
        # Process audio
        diarization = pipeline(audio_path)
        
        # Convert to structured format
        speakers = []
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            speakers.append({
                "speaker": speaker,
                "start_time": float(turn.start),
                "end_time": float(turn.end),
                "duration": float(turn.end - turn.start),
                "confidence": 1.0  # pyannote doesn't provide confidence scores directly
            })
        
        # Sort by start time
        speakers.sort(key=lambda x: x["start_time"])
        
        result = {
            "success": True,
            "speakers": speakers,
            "total_speakers": len(set(s["speaker"] for s in speakers)),
            "total_segments": len(speakers),
            "model_version": model_version,
            "device_used": str(pipeline.device) if hasattr(pipeline, 'device') else device
        }
        
        return json.dumps(result, indent=2)
        
    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e),
            "error_type": type(e).__name__
        }
        return json.dumps(error_result, indent=2)

def main():
    parser = argparse.ArgumentParser(description="Pyannote Speaker Diarization")
    parser.add_argument("audio_path", help="Path to audio file")
    parser.add_argument("--auth-token", required=True, help="Hugging Face auth token")
    parser.add_argument("--model-version", default="3.1", help="Pipeline version")
    parser.add_argument("--device", default="cpu", choices=["cpu", "cuda", "mps"], help="Processing device")
    parser.add_argument("--output", help="Output JSON file path (optional)")
    
    args = parser.parse_args()
    
    # Validate audio file exists
    if not os.path.exists(args.audio_path):
        error = {"success": False, "error": f"Audio file not found: {args.audio_path}"}
        print(json.dumps(error), flush=True)
        sys.exit(1)
    
    # Process audio
    result = process_audio(
        args.audio_path,
        args.auth_token,
        args.model_version,
        args.device
    )
    
    # Output results
    if args.output:
        with open(args.output, 'w') as f:
            f.write(result)
    
    print(result, flush=True)

if __name__ == "__main__":
    main()