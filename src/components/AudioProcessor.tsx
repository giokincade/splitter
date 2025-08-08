import React, { useEffect, useState, useRef, useCallback } from 'react';
import { ArrowLeft, Play, Pause, Download, Plus, Minus, Edit3 } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import type { Split } from './AudioSplitterApp';
import { audioCache } from '../lib/audioCache';

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
  
  // Debug audioData changes
  useEffect(() => {
    debugLog('STATE', 'audioData changed', {
      hasAudioData: !!audioData,
      audioDataLength: audioData?.length,
      audioDataType: typeof audioData,
      audioDataConstructor: audioData?.constructor.name
    });
  }, [audioData]);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [sensitivityDb, setSensitivityDb] = useState(-30); // -30 dB threshold
  const [minSilenceDuration, setMinSilenceDuration] = useState(2.0);
  const [minSongDuration, setMinSongDuration] = useState(30.0);
  const [smoothingWindow, setSmoothingWindow] = useState(5.0); // 5 second smoothing
  const [draggingSplit, setDraggingSplit] = useState<{ splitIndex: number; edge: 'start' | 'end' } | null>(null);
  const [hoveredSplit, setHoveredSplit] = useState<{ splitIndex: number; edge: 'start' | 'end' } | null>(null);
  const [currentlyPlayingSplit, setCurrentlyPlayingSplit] = useState<number | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [usedCache, setUsedCache] = useState(false);
  const waveformCacheRef = useRef<ImageData | null>(null);
  const lastDrawParamsRef = useRef<string>('');
  
  // Debug logging system
  const debugLog = (category: string, message: string, data?: any) => {
    if (debugMode) {
      const timestamp = new Date().toISOString().split('T')[1];
      console.log(`[${timestamp}] [${category}] ${message}`, data || '');
    }
  };
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioDataRef = useRef<Float32Array | null>(null);
  
  // Keep audioDataRef in sync
  useEffect(() => {
    audioDataRef.current = audioData;
  }, [audioData]);

  useEffect(() => {
    processAudioFile();
    
    // Clean up old cache entries (older than 7 days) in the background
    audioCache.clearOldCache().catch(err => {
      debugLog('CACHE', 'Failed to clear old cache', err);
    });
    
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [audioFile]);

  useEffect(() => {
    debugLog('EFFECT', 'Waveform draw effect triggered', {
      hasAudioData: !!audioData,
      audioDataLength: audioData?.length,
      duration,
      splitsLength: splits.length,
      currentTime,
      hoveredSplit,
      draggingSplit,
      isPlaying
    });
    
    if (audioData && audioData.length > 0 && duration > 0) {
      debugLog('EFFECT', 'Scheduling waveform draw');
      // Use requestAnimationFrame to ensure canvas is ready
      requestAnimationFrame(() => {
        debugLog('EFFECT', 'Executing scheduled waveform draw', {
          audioDataLengthInCallback: audioData?.length
        });
        drawWaveform();
      });
    } else {
      debugLog('EFFECT', 'Skipping waveform draw - missing data', {
        hasAudioData: !!audioData,
        audioDataLength: audioData?.length,
        duration
      });
    }
  }, [audioData, splits, currentTime, hoveredSplit, draggingSplit, isPlaying, duration, debugLog]);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setDraggingSplit(null);
    };

    if (draggingSplit) {
      document.addEventListener('mouseup', handleGlobalMouseUp);
      return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
    }
  }, [draggingSplit]);

  const processAudioFile = async () => {
    try {
      setIsLoading(true);
      setLoadingProgress(0);
      setUsedCache(false);
      
      // Initialize audio cache
      setLoadingStep('Initializing cache...');
      setLoadingProgress(5);
      await audioCache.init();
      
      // Check for cached audio data
      setLoadingStep('Checking cache...');
      setLoadingProgress(10);
      const cachedData = await audioCache.getCachedAudio(audioFile);
      
      let audioBuffer: AudioBuffer;
      let channelData: Float32Array;
      
      if (cachedData) {
        debugLog('CACHE', 'Using cached audio data', {
          fileName: cachedData.fileName,
          cachedAt: new Date(cachedData.cachedAt).toISOString(),
          duration: cachedData.duration
        });
        
        setLoadingStep('Loading from cache...');
        setLoadingProgress(30);
        setUsedCache(true);
        
        // Create AudioBuffer from cached data
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;
        
        audioBuffer = audioContext.createBuffer(1, cachedData.audioData.length, cachedData.sampleRate);
        audioBuffer.getChannelData(0).set(cachedData.audioData);
        
        channelData = cachedData.audioData;
        setDuration(cachedData.duration);
        setLoadingProgress(60);
        
      } else {
        debugLog('CACHE', 'No cache found, processing file', {
          fileName: audioFile.name,
          fileSize: audioFile.size
        });
        
        setLoadingStep('Reading file...');
        setLoadingProgress(15);
        const arrayBuffer = await audioFile.arrayBuffer();
        
        setLoadingStep('Decoding audio...');
        setLoadingProgress(25);
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;
        
        const startDecode = Date.now();
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const decodeTime = Date.now() - startDecode;
        
        debugLog('AUDIO', 'Audio decoded', { decodeTime });
        
        setLoadingProgress(50);
        setDuration(audioBuffer.duration);
        
        // Get audio data for waveform visualization
        channelData = audioBuffer.getChannelData(0);
        
        // Cache the decoded data for future use
        setLoadingStep('Caching audio data...');
        setLoadingProgress(55);
        try {
          await audioCache.setCachedAudio(
            audioFile,
            channelData,
            audioBuffer.sampleRate,
            audioBuffer.duration
          );
          debugLog('CACHE', 'Audio data cached successfully');
        } catch (cacheError) {
          debugLog('CACHE', 'Failed to cache audio data', cacheError);
          // Continue anyway, caching is not critical
        }
      }
      
      setLoadingStep('Processing waveform...');
      setLoadingProgress(70);
      setAudioBuffer(audioBuffer);
      
      debugLog('AUDIO', 'Audio data ready', {
        channelDataLength: channelData.length,
        sampleRate: audioBuffer.sampleRate,
        duration: audioBuffer.duration,
        usedCache: cachedData !== null
      });
      setAudioData(channelData);
      
      setLoadingStep('Detecting splits...');
      setLoadingProgress(85);
      // Detect splits based on volume changes
      const detectedSplits = detectSplits(channelData, audioBuffer.sampleRate);
      setSplits(detectedSplits);
      
      setLoadingProgress(100);
      
    } catch (error) {
      console.error('Error processing audio file:', error);
      debugLog('ERROR', 'Failed to process audio file', error);
    } finally {
      setIsLoading(false);
    }
  };

  const detectSplits = (audioData: Float32Array, sampleRate: number): Split[] => {
    const windowSize = sampleRate * 0.5; // 0.5 second windows for better resolution
    const smoothingWindowSamples = Math.floor(smoothingWindow * sampleRate / windowSize);
    const thresholdLinear = Math.pow(10, sensitivityDb / 20); // Convert dB to linear
    const minSilenceDurationToUse = minSilenceDuration;
    const minSongDurationToUse = minSongDuration;
    
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
    
    // Apply smoothing to reduce noise
    const smoothedVolumes: number[] = [];
    for (let i = 0; i < volumes.length; i++) {
      const start = Math.max(0, i - Math.floor(smoothingWindowSamples / 2));
      const end = Math.min(volumes.length, i + Math.floor(smoothingWindowSamples / 2) + 1);
      
      let sum = 0;
      for (let j = start; j < end; j++) {
        sum += volumes[j];
      }
      
      smoothedVolumes.push(sum / (end - start));
    }
    
    // Calculate overall average and standard deviation for better thresholding
    const avgVolume = smoothedVolumes.reduce((a, b) => a + b, 0) / smoothedVolumes.length;
    const variance = smoothedVolumes.reduce((a, b) => a + Math.pow(b - avgVolume, 2), 0) / smoothedVolumes.length;
    const stdDev = Math.sqrt(variance);
    
    // Use both absolute threshold and relative threshold based on audio characteristics
    const relativeThreshold = Math.max(avgVolume * 0.15, avgVolume - stdDev * 0.8);
    const actualThreshold = Math.max(thresholdLinear, relativeThreshold);
    
    // Find potential split points using multiple criteria
    const potentialSplits: Array<{ time: number; confidence: number }> = [];
    
    for (let i = 1; i < smoothedVolumes.length - 1; i++) {
      const timeInSeconds = (i * windowSize) / sampleRate;
      const currentVol = smoothedVolumes[i];
      const prevVol = smoothedVolumes[i - 1];
      const nextVol = smoothedVolumes[i + 1];
      
      let confidence = 0;
      
      // Criteria 1: Low volume relative to average
      if (currentVol < actualThreshold) {
        confidence += 0.3;
      }
      
      // Criteria 2: Local minimum (valley in waveform)
      if (currentVol < prevVol && currentVol < nextVol) {
        confidence += 0.2;
      }
      
      // Criteria 3: Sustained volume drop
      const lookAhead = Math.min(smoothingWindowSamples, smoothedVolumes.length - i);
      const lookBehind = Math.min(smoothingWindowSamples, i);
      
      const avgBefore = smoothedVolumes.slice(i - lookBehind, i).reduce((a, b) => a + b, 0) / lookBehind;
      const avgAfter = smoothedVolumes.slice(i, i + lookAhead).reduce((a, b) => a + b, 0) / lookAhead;
      
      if (currentVol < avgBefore * 0.5 && currentVol < avgAfter * 0.5) {
        confidence += 0.3;
      }
      
      // Criteria 4: Long enough gap from previous split
      const lastSplit = potentialSplits[potentialSplits.length - 1];
      if (!lastSplit || timeInSeconds - lastSplit.time > minSongDurationToUse * 0.5) {
        confidence += 0.2;
      }
      
      if (confidence > 0.4) { // Threshold for considering a split
        potentialSplits.push({ time: timeInSeconds, confidence });
      }
    }
    
    // Convert high-confidence splits to quiet regions
    const quietRegions: Array<{ start: number; end: number }> = [];
    
    for (const split of potentialSplits) {
      if (split.confidence > 0.6) {
        // Find the actual quiet period around this split point
        const startTime = Math.max(0, split.time - minSilenceDurationToUse / 2);
        const endTime = Math.min(audioData.length / sampleRate, split.time + minSilenceDurationToUse / 2);
        
        // Merge overlapping regions
        const lastRegion = quietRegions[quietRegions.length - 1];
        if (lastRegion && startTime <= lastRegion.end) {
          lastRegion.end = Math.max(lastRegion.end, endTime);
        } else {
          quietRegions.push({ start: startTime, end: endTime });
        }
      }
    }
    
    // Convert quiet regions to song splits
    const detectedSplits: Split[] = [];
    let songStart = 0;
    let songIndex = 1;
    
    for (const quiet of quietRegions) {
      const songDuration = quiet.start - songStart;
      
      if (songDuration >= minSongDurationToUse) {
        detectedSplits.push({
          id: `song-${songIndex}`,
          name: `Song ${songIndex}`,
          startTime: songStart,
          endTime: quiet.start
        });
        
        songStart = quiet.end;
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
    debugLog('DRAW', 'drawWaveform called');
    
    const canvas = canvasRef.current;
    debugLog('DRAW', 'Canvas check', { hasCanvas: !!canvas });
    
    if (!canvas) {
      debugLog('DRAW', 'ERROR: No canvas found');
      return;
    }
    
    // Check both state and ref
    const currentAudioData = audioDataRef.current;
    debugLog('DRAW', 'AudioData comparison', {
      stateAudioData: !!audioData,
      stateAudioDataLength: audioData?.length,
      refAudioData: !!currentAudioData,
      refAudioDataLength: currentAudioData?.length,
      areEqual: audioData === currentAudioData
    });
    
    if (!currentAudioData) {
      debugLog('DRAW', 'ERROR: No audioData in ref');
      return;
    }
    
    if (currentAudioData.length === 0) {
      debugLog('DRAW', 'ERROR: audioData is empty - this is the bug!', {
        audioDataType: typeof currentAudioData,
        audioDataConstructor: currentAudioData.constructor.name,
        audioDataLength: currentAudioData.length
      });
      return;
    }
    
    // Use the ref data instead of state
    const audioDataToUse = currentAudioData;
    
    if (duration <= 0) {
      debugLog('DRAW', 'ERROR: Invalid duration', { duration });
      return;
    }
    
    const ctx = canvas.getContext('2d');
    debugLog('DRAW', 'Context check', { hasContext: !!ctx });
    
    if (!ctx) {
      debugLog('DRAW', 'ERROR: Could not get 2d context');
      return;
    }
    
    const { width, height } = canvas;
    debugLog('DRAW', 'Canvas dimensions', { width, height });
    
    if (width <= 0 || height <= 0) {
      debugLog('DRAW', 'ERROR: Invalid canvas dimensions', { width, height });
      return;
    }
    
    debugLog('DRAW', 'Starting waveform draw', {
      audioDataLength: audioDataToUse.length,
      duration,
      splitsCount: splits.length
    });
    
    // Always clear and redraw - optimized for speed
    ctx.clearRect(0, 0, width, height);
    debugLog('DRAW', 'Canvas cleared');
    
    // Aggressive optimization for long recordings
    const samplesPerPixel = Math.max(1, Math.floor(audioDataToUse.length / width));
    const isVeryLong = audioDataToUse.length > 44100 * 300; // 5+ minutes
    const step = isVeryLong ? Math.max(1, Math.floor(samplesPerPixel / 16)) : 1; // More aggressive skip
    
    debugLog('DRAW', 'Waveform parameters', {
      samplesPerPixel,
      isVeryLong,
      step,
      totalSamples: audioDataToUse.length
    });
    
    try {
      // Draw waveform background
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(0, height / 2, width, 1);
      debugLog('DRAW', 'Background drawn');
      
      // Direct rendering without pre-calculation for better performance
      ctx.fillStyle = '#3b82f6';
      debugLog('DRAW', 'Starting waveform data rendering');
      
      for (let x = 0; x < width; x++) {
        const startSample = x * samplesPerPixel;
        const endSample = Math.min(startSample + samplesPerPixel, audioDataToUse.length);
        
        let min = 0;
        let max = 0;
        
        for (let i = startSample; i < endSample; i += step) {
          const sample = audioDataToUse[i];
          if (sample < min) min = sample;
          if (sample > max) max = sample;
        }
        
        const y1 = ((min + 1) / 2) * height;
        const y2 = ((max + 1) / 2) * height;
        
        const rectHeight = Math.abs(y2 - y1) || 1;
        ctx.fillRect(x, Math.min(y1, y2), 1, rectHeight);
      }
      
      debugLog('DRAW', 'Waveform data rendered');
    } catch (error) {
      debugLog('DRAW', 'ERROR during waveform rendering', error);
    }
    
    // Draw split markers with hover/drag states (simplified layout)
    debugLog('DRAW', 'Drawing split markers', { splitsCount: splits.length });
    
    splits.forEach((split, index) => {
      // Ensure times are valid
      if (split.startTime < 0 || split.endTime > duration || split.startTime >= split.endTime) {
        debugLog('DRAW', 'Skipping invalid split', { 
          index, 
          split: { 
            startTime: split.startTime, 
            endTime: split.endTime, 
            name: split.name 
          },
          duration 
        });
        return; // Skip invalid splits
      }
      
      const startX = Math.round((split.startTime / duration) * width);
      const endX = Math.round((split.endTime / duration) * width);
      
      // Check if this split is being hovered or dragged
      const isStartHovered = hoveredSplit?.splitIndex === index && hoveredSplit?.edge === 'start';
      const isEndHovered = hoveredSplit?.splitIndex === index && hoveredSplit?.edge === 'end';
      const isStartDragging = draggingSplit?.splitIndex === index && draggingSplit?.edge === 'start';
      const isEndDragging = draggingSplit?.splitIndex === index && draggingSplit?.edge === 'end';
      
      // Split start line
      ctx.strokeStyle = isStartHovered || isStartDragging ? '#dc2626' : '#ef4444';
      ctx.lineWidth = isStartHovered || isStartDragging ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(startX, 0);
      ctx.lineTo(startX, height);
      ctx.stroke();
      
      // Split end line
      ctx.strokeStyle = isEndHovered || isEndDragging ? '#dc2626' : '#ef4444';
      ctx.lineWidth = isEndHovered || isEndDragging ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(endX, 0);
      ctx.lineTo(endX, height);
      ctx.stroke();
      
      // Drag handles (small circles at top)
      const handleRadius = 4;
      ctx.fillStyle = isStartHovered || isStartDragging ? '#dc2626' : '#ef4444';
      ctx.beginPath();
      ctx.arc(startX, 10, handleRadius, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = isEndHovered || isEndDragging ? '#dc2626' : '#ef4444';
      ctx.beginPath();
      ctx.arc(endX, 10, handleRadius, 0, Math.PI * 2);
      ctx.fill();
      
      // Label
      ctx.fillStyle = '#ef4444';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(split.name, startX + 4, 26);
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

  const playAudio = async (startTime?: number, endTime?: number, splitIndex?: number) => {
    debugLog('AUDIO', 'playAudio called', { startTime, endTime, splitIndex });
    
    if (!audioBuffer || !audioContextRef.current) {
      debugLog('AUDIO', 'playAudio early return - missing audio', {
        hasAudioBuffer: !!audioBuffer,
        hasAudioContext: !!audioContextRef.current
      });
      return;
    }
    
    // Stop current playback
    if (sourceRef.current) {
      sourceRef.current.stop();
      sourceRef.current = null;
    }
    
    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);
    
    const start = startTime || currentTime;
    const playDuration = endTime ? endTime - start : undefined;
    
    source.start(0, start, playDuration);
    sourceRef.current = source;
    startTimeRef.current = audioContextRef.current.currentTime - start;
    
    setIsPlaying(true);
    setCurrentlyPlayingSplit(splitIndex ?? null);
    
    source.onended = () => {
      setIsPlaying(false);
      setCurrentlyPlayingSplit(null);
      sourceRef.current = null;
      if (!endTime) {
        setCurrentTime(0);
      }
    };
    
    // Update current time during playback
    const updateTime = () => {
      if (sourceRef.current && audioContextRef.current) {
        const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
        const newTime = Math.min(start + elapsed, audioBuffer.duration);
        setCurrentTime(newTime);
        
        if (elapsed < (playDuration || audioBuffer.duration - start)) {
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
    setCurrentlyPlayingSplit(null);
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const addSplit = () => {
    // Ensure we have valid current time and duration
    if (!duration || currentTime < 0 || currentTime >= duration) return;
    
    const newSplit: Split = {
      id: `split-${Date.now()}`,
      name: `Song ${splits.length + 1}`,
      startTime: Math.max(0, currentTime),
      endTime: Math.min(currentTime + 60, duration) // Default 1 minute duration
    };
    
    // Ensure the new split doesn't overlap with existing ones
    const validSplit = splits.every(existing => 
      newSplit.endTime <= existing.startTime || newSplit.startTime >= existing.endTime
    );
    
    if (validSplit) {
      setSplits([...splits, newSplit].sort((a, b) => a.startTime - b.startTime));
    }
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

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !audioData || duration <= 0) {
      debugLog('MOUSE', 'MouseMove early return', {
        hasCanvas: !!canvas,
        hasAudioData: !!audioData,
        duration
      });
      return;
    }
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const waveformWidth = rect.width; // Use actual rendered width
    
    debugLog('MOUSE', 'MouseMove', {
      x, y, waveformWidth,
      draggingSplit,
      splitsLength: splits.length
    });
    
    if (draggingSplit) {
      // Update split position while dragging
      const relativeX = Math.max(0, Math.min(1, x / waveformWidth));
      const newTime = relativeX * duration;
      
      // Validate split index exists
      if (draggingSplit.splitIndex >= 0 && draggingSplit.splitIndex < splits.length) {
        const updatedSplits = [...splits];
        const split = updatedSplits[draggingSplit.splitIndex];
        
        if (draggingSplit.edge === 'start') {
          split.startTime = Math.max(0, Math.min(newTime, split.endTime - 1));
        } else {
          split.endTime = Math.max(split.startTime + 1, Math.min(newTime, duration));
        }
        
        // Filter out any invalid splits and update
        const validSplits = updatedSplits.filter(s => 
          s.startTime >= 0 && 
          s.endTime <= duration && 
          s.startTime < s.endTime
        );
        debugLog('STATE', 'Updating splits after drag', {
          originalCount: updatedSplits.length,
          validCount: validSplits.length,
          draggingSplit
        });
        setSplits(validSplits);
      }
      return;
    }
    
    // Check for hover over split handles - be more precise
    let newHovered: typeof hoveredSplit = null;
    const handleRadius = 8; // Slightly larger hit area
    
    debugLog('MOUSE', 'Checking hover detection', {
      splitsCount: splits.length,
      handleRadius,
      mouseY: y
    });
    
    for (let i = 0; i < splits.length; i++) {
      const split = splits[i];
      const startX = (split.startTime / duration) * waveformWidth;
      const endX = (split.endTime / duration) * waveformWidth;
      
      debugLog('MOUSE', `Split ${i} positions`, {
        splitName: split.name,
        startX, endX,
        startDistance: Math.abs(x - startX),
        endDistance: Math.abs(x - endX),
        withinRadius: Math.abs(x - startX) < handleRadius || Math.abs(x - endX) < handleRadius
      });
      
      // Check start handle first (higher priority)
      if (Math.abs(x - startX) < handleRadius && y < 30) {
        newHovered = { splitIndex: i, edge: 'start' };
        debugLog('MOUSE', 'Hovering start handle', { splitIndex: i });
        break;
      } else if (Math.abs(x - endX) < handleRadius && y < 30) {
        newHovered = { splitIndex: i, edge: 'end' };
        debugLog('MOUSE', 'Hovering end handle', { splitIndex: i });
        break;
      }
    }
    
    setHoveredSplit(newHovered);
    
    // Update cursor
    canvas.style.cursor = newHovered ? 'ew-resize' : 'pointer';
  }, [audioData, duration, splits, draggingSplit, hoveredSplit, debugLog]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !audioData || duration <= 0) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const waveformWidth = rect.width;
    const handleRadius = 8;
    
    // Check for clicks on split handles first (priority over other actions)
    for (let i = 0; i < splits.length; i++) {
      const split = splits[i];
      const startX = (split.startTime / duration) * waveformWidth;
      const endX = (split.endTime / duration) * waveformWidth;
      
      // Check start handle
      if (Math.abs(x - startX) < handleRadius && y < 30) {
        setDraggingSplit({ splitIndex: i, edge: 'start' });
        e.preventDefault();
        return;
      } 
      // Check end handle
      else if (Math.abs(x - endX) < handleRadius && y < 30) {
        setDraggingSplit({ splitIndex: i, edge: 'end' });
        e.preventDefault();
        return;
      }
      
      // Check for right-click to remove split (anywhere in split region)
      if (e.button === 2 && x >= startX && x <= endX && y > 30) {
        e.preventDefault();
        removeSplit(i);
        return;
      }
    }
    
    // If not clicking on a handle, click-to-play functionality
    const relativeX = Math.max(0, Math.min(1, x / waveformWidth));
    const newTime = relativeX * duration;
    setCurrentTime(newTime);
    
    // Start playing from the clicked position
    if (!isPlaying) {
      playAudio(newTime);
    }
  }, [audioData, duration, splits, isPlaying, removeSplit, playAudio, debugLog]);

  const handleCanvasMouseUp = useCallback(() => {
    setDraggingSplit(null);
  }, []);

  const handleCanvasMouseLeave = useCallback(() => {
    setHoveredSplit(null);
    // Don't clear dragging state on mouse leave - let global mouseup handle it
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = 'default';
  }, []);

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
          <div className="flex items-center space-x-2">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Button 
              variant={debugMode ? "default" : "outline"} 
              size="sm"
              onClick={() => setDebugMode(!debugMode)}
              title="Toggle debug logging in console"
            >
              🐛 Debug
            </Button>
            {debugMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const cacheInfo = await audioCache.getCacheSize();
                  alert(`Cache: ${cacheInfo.count} files, ~${cacheInfo.estimatedSizeMB.toFixed(1)} MB`);
                }}
                title="Show cache information"
              >
                📊 Cache Info
              </Button>
            )}
          </div>
          <h1 className="text-2xl font-bold">Audio Splitter</h1>
          <Button onClick={downloadSplits} disabled={splits.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Download Splits
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Waveform & Controls</CardTitle>
              {usedCache && (
                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                  📦 Loaded from cache
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <canvas
              ref={canvasRef}
              width={800}
              height={200}
              className="w-full border rounded cursor-default"
              onMouseMove={handleCanvasMouseMove}
              onMouseDown={handleCanvasMouseDown}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseLeave}
              onContextMenu={(e) => e.preventDefault()}
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Threshold: {sensitivityDb} dB
                </label>
                <input
                  type="range"
                  min="-60"
                  max="-10"
                  step="2"
                  value={sensitivityDb}
                  onChange={(e) => setSensitivityDb(parseInt(e.target.value))}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Higher = more sensitive (closer to 0)
                </p>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Smoothing: {smoothingWindow}s
                </label>
                <input
                  type="range"
                  min="1"
                  max="15"
                  step="1"
                  value={smoothingWindow}
                  onChange={(e) => setSmoothingWindow(parseFloat(e.target.value))}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Averages volume over time to ignore brief noise/coughs
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
                  How long a quiet period must last to split songs
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
                      onClick={() => {
                        if (currentlyPlayingSplit === index) {
                          stopAudio();
                        } else {
                          playAudio(split.startTime, split.endTime, index);
                        }
                      }}
                    >
                      {currentlyPlayingSplit === index ? 
                        <Pause className="h-3 w-3" /> : 
                        <Play className="h-3 w-3" />
                      }
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