import React, { useEffect, useState, useRef } from 'react';
import { ArrowLeft, Play, Pause, Download, Plus, Minus, Edit3 } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import type { Split } from './AudioSplitterApp';

interface AudioProcessorProps {
  audioFile: File;
  splits: Split[];
  setSplits: (splits: Split[]) => void;
  onBack: () => void;
}

export default function AudioProcessor({ audioFile, splits, setSplits, onBack }: AudioProcessorProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStep, setLoadingStep] = useState('');
  const [audioData, setAudioData] = useState<Float32Array | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [sensitivity, setSensitivity] = useState(0.02);
  const [minSilenceDuration, setMinSilenceDuration] = useState(2.0);
  const [minSongDuration, setMinSongDuration] = useState(30.0);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    processAudioFile();
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [audioFile]);

  useEffect(() => {
    if (audioData) {
      drawWaveform();
    }
  }, [audioData, splits, currentTime]);

  const processAudioFile = async () => {
    try {
      setIsLoading(true);
      setLoadingProgress(0);
      
      setLoadingStep('Reading file...');
      setLoadingProgress(10);
      const arrayBuffer = await audioFile.arrayBuffer();
      
      setLoadingStep('Decoding audio...');
      setLoadingProgress(30);
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      
      const buffer = await audioContext.decodeAudioData(arrayBuffer);
      setAudioBuffer(buffer);
      setDuration(buffer.duration);
      
      setLoadingStep('Processing waveform...');
      setLoadingProgress(60);
      // Get audio data for waveform visualization
      const channelData = buffer.getChannelData(0);
      setAudioData(channelData);
      
      setLoadingStep('Detecting splits...');
      setLoadingProgress(80);
      // Detect splits based on volume changes
      const detectedSplits = detectSplits(channelData, buffer.sampleRate);
      setSplits(detectedSplits);
      
      setLoadingProgress(100);
      
    } catch (error) {
      console.error('Error processing audio file:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const detectSplits = (audioData: Float32Array, sampleRate: number): Split[] => {
    const windowSize = sampleRate * 2; // 2 second windows
    const threshold = sensitivity; // Use adjustable sensitivity
    const minSilenceDurationToUse = minSilenceDuration; // Use adjustable silence duration
    const minSongDurationToUse = minSongDuration; // Use adjustable song duration
    
    const volumes: number[] = [];
    
    // Calculate RMS volume for each window
    for (let i = 0; i < audioData.length; i += windowSize) {
      let sum = 0;
      const windowEnd = Math.min(i + windowSize, audioData.length);
      
      for (let j = i; j < windowEnd; j++) {
        sum += audioData[j] * audioData[j];
      }
      
      const rms = Math.sqrt(sum / (windowEnd - i));
      volumes.push(rms);
    }
    
    // Find silent regions
    const silentRegions: Array<{ start: number; end: number }> = [];
    let silenceStart = -1;
    
    for (let i = 0; i < volumes.length; i++) {
      const timeInSeconds = (i * windowSize) / sampleRate;
      
      if (volumes[i] < threshold) {
        if (silenceStart === -1) {
          silenceStart = timeInSeconds;
        }
      } else {
        if (silenceStart !== -1) {
          const silenceEnd = timeInSeconds;
          const silenceDuration = silenceEnd - silenceStart;
          
          if (silenceDuration >= minSilenceDurationToUse) {
            silentRegions.push({ start: silenceStart, end: silenceEnd });
          }
          silenceStart = -1;
        }
      }
    }
    
    // Convert silent regions to song splits
    const detectedSplits: Split[] = [];
    let songStart = 0;
    let songIndex = 1;
    
    for (const silence of silentRegions) {
      const songDuration = silence.start - songStart;
      
      if (songDuration >= minSongDurationToUse) {
        detectedSplits.push({
          id: `song-${songIndex}`,
          name: `Song ${songIndex}`,
          startTime: songStart,
          endTime: silence.start
        });
        
        songStart = silence.end;
        songIndex++;
      }
    }
    
    // Add the final song if it's long enough
    const finalDuration = (audioData.length / sampleRate) - songStart;
    if (finalDuration >= minSongDurationToUse) {
      detectedSplits.push({
        id: `song-${songIndex}`,
        name: `Song ${songIndex}`,
        startTime: songStart,
        endTime: audioData.length / sampleRate
      });
    }
    
    return detectedSplits;
  };

  const drawWaveform = () => {
    const canvas = canvasRef.current;
    if (!canvas || !audioData) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    
    // Draw waveform
    const samplesPerPixel = Math.floor(audioData.length / width);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    for (let x = 0; x < width; x++) {
      const startSample = x * samplesPerPixel;
      const endSample = Math.min(startSample + samplesPerPixel, audioData.length);
      
      let min = 0;
      let max = 0;
      
      for (let i = startSample; i < endSample; i++) {
        const sample = audioData[i];
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }
      
      const y1 = ((min + 1) / 2) * height;
      const y2 = ((max + 1) / 2) * height;
      
      if (x === 0) {
        ctx.moveTo(x, y1);
      } else {
        ctx.lineTo(x, y1);
      }
      ctx.lineTo(x, y2);
    }
    
    ctx.stroke();
    
    // Draw split markers
    splits.forEach((split, index) => {
      const startX = (split.startTime / duration) * width;
      const endX = (split.endTime / duration) * width;
      
      // Split start line
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(startX, 0);
      ctx.lineTo(startX, height);
      ctx.stroke();
      
      // Split end line
      ctx.beginPath();
      ctx.moveTo(endX, 0);
      ctx.lineTo(endX, height);
      ctx.stroke();
      
      // Label
      ctx.fillStyle = '#ef4444';
      ctx.font = '12px sans-serif';
      ctx.fillText(split.name, startX + 4, 16);
    });
    
    // Draw current time indicator
    if (currentTime > 0) {
      const x = (currentTime / duration) * width;
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  };

  const playAudio = async (startTime?: number, endTime?: number) => {
    if (!audioBuffer || !audioContextRef.current) return;
    
    // Stop current playback
    if (sourceRef.current) {
      sourceRef.current.stop();
    }
    
    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);
    
    const start = startTime || currentTime;
    const duration = endTime ? endTime - start : undefined;
    
    source.start(0, start, duration);
    sourceRef.current = source;
    startTimeRef.current = audioContextRef.current.currentTime - start;
    
    setIsPlaying(true);
    
    source.onended = () => {
      setIsPlaying(false);
      if (!endTime) {
        setCurrentTime(0);
      }
    };
    
    // Update current time during playback
    const updateTime = () => {
      if (isPlaying && audioContextRef.current) {
        const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
        setCurrentTime(Math.min(elapsed, audioBuffer.duration));
        if (elapsed < audioBuffer.duration) {
          requestAnimationFrame(updateTime);
        }
      }
    };
    requestAnimationFrame(updateTime);
  };

  const stopAudio = () => {
    if (sourceRef.current) {
      sourceRef.current.stop();
      sourceRef.current = null;
    }
    setIsPlaying(false);
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const addSplit = () => {
    const newSplit: Split = {
      id: `split-${Date.now()}`,
      name: `Song ${splits.length + 1}`,
      startTime: currentTime,
      endTime: Math.min(currentTime + 60, duration) // Default 1 minute duration
    };
    setSplits([...splits, newSplit].sort((a, b) => a.startTime - b.startTime));
  };

  const removeSplit = (index: number) => {
    setSplits(splits.filter((_, i) => i !== index));
  };

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setEditingName(splits[index].name);
  };

  const finishEditing = () => {
    if (editingIndex !== null) {
      const updatedSplits = [...splits];
      updatedSplits[editingIndex].name = editingName;
      setSplits(updatedSplits);
    }
    setEditingIndex(null);
    setEditingName('');
  };

  const reprocessSplits = () => {
    if (!audioData || !audioBuffer) return;
    
    setLoadingStep('Reprocessing splits...');
    setIsLoading(true);
    setLoadingProgress(0);
    
    setTimeout(() => {
      setLoadingProgress(50);
      const detectedSplits = detectSplits(audioData, audioBuffer.sampleRate);
      setSplits(detectedSplits);
      setLoadingProgress(100);
      setIsLoading(false);
    }, 100);
  };

  const downloadSplits = async () => {
    if (!audioBuffer || splits.length === 0) return;
    
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    
    for (const split of splits) {
      const startSample = Math.floor(split.startTime * audioBuffer.sampleRate);
      const endSample = Math.floor(split.endTime * audioBuffer.sampleRate);
      const length = endSample - startSample;
      
      // Create new audio buffer for this split
      const splitBuffer = audioContextRef.current!.createBuffer(
        audioBuffer.numberOfChannels,
        length,
        audioBuffer.sampleRate
      );
      
      // Copy audio data
      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        const channelData = audioBuffer.getChannelData(channel);
        const splitChannelData = splitBuffer.getChannelData(channel);
        
        for (let i = 0; i < length; i++) {
          splitChannelData[i] = channelData[startSample + i] || 0;
        }
      }
      
      // Convert to WAV
      const wavData = audioBufferToWav(splitBuffer);
      const fileName = `${split.name.replace(/[^a-z0-9]/gi, '_')}.wav`;
      zip.file(fileName, wavData);
    }
    
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audio_splits.zip';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Simple WAV file creation
  const audioBufferToWav = (buffer: AudioBuffer): ArrayBuffer => {
    const length = buffer.length;
    const channels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = channels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = length * blockAlign;
    const bufferSize = 44 + dataSize;
    
    const arrayBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrayBuffer);
    
    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, bufferSize - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);
    
    // Convert float samples to 16-bit PCM
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < channels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample * 0x7FFF, true);
        offset += 2;
      }
    }
    
    return arrayBuffer;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardContent className="p-6">
            <div className="text-center space-y-4">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
              <div className="space-y-2">
                <p className="font-medium">{loadingStep}</p>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div 
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{ width: `${loadingProgress}%` }}
                  ></div>
                </div>
                <p className="text-sm text-muted-foreground">{loadingProgress}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">Audio Splitter</h1>
          <Button onClick={downloadSplits} disabled={splits.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Download Splits
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Waveform & Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <canvas
              ref={canvasRef}
              width={800}
              height={200}
              className="w-full border rounded"
            />
            
            <div className="flex items-center justify-center space-x-4">
              <Button
                variant="outline"
                size="icon"
                onClick={isPlaying ? stopAudio : () => playAudio()}
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              
              <span className="text-sm font-mono">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
              
              <Button variant="outline" size="sm" onClick={addSplit}>
                <Plus className="h-4 w-4 mr-2" />
                Add Split
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Split Detection Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Sensitivity: {sensitivity.toFixed(3)}
                </label>
                <input
                  type="range"
                  min="0.005"
                  max="0.1"
                  step="0.005"
                  value={sensitivity}
                  onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Lower = more sensitive to quiet parts
                </p>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Min Silence: {minSilenceDuration}s
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="10"
                  step="0.5"
                  value={minSilenceDuration}
                  onChange={(e) => setMinSilenceDuration(parseFloat(e.target.value))}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Minimum silence duration to split
                </p>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Min Song: {minSongDuration}s
                </label>
                <input
                  type="range"
                  min="10"
                  max="120"
                  step="10"
                  value={minSongDuration}
                  onChange={(e) => setMinSongDuration(parseFloat(e.target.value))}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Minimum song length
                </p>
              </div>
            </div>
            
            <div className="mt-4 flex justify-center">
              <Button onClick={reprocessSplits} disabled={!audioData}>
                Reprocess Splits
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Detected Splits ({splits.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {splits.map((split, index) => (
                <div key={split.id} className="flex items-center justify-between p-3 border rounded">
                  <div className="flex items-center space-x-4">
                    {editingIndex === index ? (
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={finishEditing}
                        onKeyDown={(e) => e.key === 'Enter' && finishEditing()}
                        className="w-40"
                        autoFocus
                      />
                    ) : (
                      <span 
                        className="font-medium cursor-pointer hover:text-primary"
                        onClick={() => startEditing(index)}
                      >
                        {split.name}
                      </span>
                    )}
                    <span className="text-sm text-muted-foreground">
                      {formatTime(split.startTime)} - {formatTime(split.endTime)}
                      ({formatTime(split.endTime - split.startTime)})
                    </span>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => playAudio(split.startTime, split.endTime)}
                    >
                      <Play className="h-3 w-3" />
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startEditing(index)}
                    >
                      <Edit3 className="h-3 w-3" />
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeSplit(index)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
              
              {splits.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No splits detected. Try adding splits manually using the "Add Split" button.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}