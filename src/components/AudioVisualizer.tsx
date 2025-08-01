import React from 'react';

interface AudioVisualizerProps {
  systemAudioLevel: number;
  microphoneAudioLevel: number;
  systemAudioActive: boolean;
  microphoneAudioActive: boolean;
  audioLevel: number;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  systemAudioLevel,
  microphoneAudioLevel,
  systemAudioActive,
  microphoneAudioActive,
  audioLevel
}) => {
  return (
    <div className="audio-visualizer">
      {/* Show dual stream indicators when both are active */}
      {systemAudioActive && microphoneAudioActive ? (
        <div className="dual-audio-bars">
          <div className="audio-stream">
            <div className="stream-label">🔊</div>
            <div className="audio-bars">
              {[...Array(2)].map((_, i) => (
                <div
                  key={`sys-${i}`}
                  className="audio-bar system-audio"
                  style={{
                    animationDelay: `${i * 0.1}s`,
                    height: `${Math.min(100, 20 + systemAudioLevel * 0.8)}%`,
                  }}
                />
              ))}
            </div>
          </div>
          <div className="audio-stream">
            <div className="stream-label">🎤</div>
            <div className="audio-bars">
              {[...Array(2)].map((_, i) => (
                <div
                  key={`mic-${i}`}
                  className="audio-bar microphone-audio"
                  style={{
                    animationDelay: `${i * 0.1 + 0.05}s`,
                    height: `${Math.min(100, 20 + microphoneAudioLevel * 0.8)}%`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Single stream fallback - show active stream with label */
        <div className="single-audio-bars">
          {systemAudioActive && !microphoneAudioActive ? (
            <div className="audio-stream">
              <div className="stream-label">🔊</div>
              <div className="audio-bars">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={`sys-${i}`}
                    className="audio-bar system-audio"
                    style={{
                      animationDelay: `${i * 0.1}s`,
                      height: `${Math.min(100, 20 + systemAudioLevel * 0.8)}%`,
                    }}
                  />
                ))}
              </div>
            </div>
          ) : microphoneAudioActive && !systemAudioActive ? (
            <div className="audio-stream">
              <div className="stream-label">🎤</div>
              <div className="audio-bars">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={`mic-${i}`}
                    className="audio-bar microphone-audio"
                    style={{
                      animationDelay: `${i * 0.1}s`,
                      height: `${Math.min(100, 20 + microphoneAudioLevel * 0.8)}%`,
                    }}
                  />
                ))}
              </div>
            </div>
          ) : (
            /* Neither stream active - fallback */
            <div className="audio-bars">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="audio-bar"
                  style={{
                    animationDelay: `${i * 0.1}s`,
                    height: `${Math.min(100, 20 + audioLevel * 0.8)}%`,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};