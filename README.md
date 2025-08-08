# Audio Splitter

A client-side web application for automatically splitting musical rehearsal recordings into individual song files. Perfect for bands, choirs, and musicians who record long practice sessions and need to extract individual songs.

## 🎵 Objectives

### Primary Goal
Take a single WAV or MP3 file containing multiple songs (like a rehearsal recording) and automatically split it into separate audio files for each song.

### Key Features
- **100% Client-Side Processing**: No server required, no data leaves your browser
- **Automatic Split Detection**: Uses volume analysis to identify natural breaks between songs
- **Interactive Editing**: Visual waveform with drag-and-drop split adjustment
- **Smart Caching**: Decoded audio cached locally for instant re-processing
- **Batch Export**: Download all splits as individual WAV files in a ZIP archive

### Target Use Cases
- **Band Rehearsals**: Split 2-hour practice sessions into individual songs
- **Choir Recordings**: Extract individual pieces from long recordings  
- **Music Lessons**: Separate multiple exercises or songs from lesson recordings
- **Live Performances**: Split concert recordings into individual tracks

## 🏗️ Architecture

### Technology Stack
- **Frontend Framework**: [Astro](https://astro.build/) with React components
- **Language**: TypeScript for type safety
- **UI Components**: [shadcn/ui](https://ui.shadcn.com/) with Tailwind CSS
- **Audio Processing**: Web Audio API for client-side audio manipulation
- **Storage**: IndexedDB for caching decoded audio data

### Application Flow

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   File Upload   │ -> │  Audio Processing │ -> │  Split Editing  │
│                 │    │                  │    │                 │
│ • Drag & Drop   │    │ • Decode Audio   │    │ • Waveform View │
│ • File Picker   │    │ • Volume Analysis│    │ • Drag Splits   │
│ • WAV/MP3 Only  │    │ • Cache Results  │    │ • Play Previews │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
                       ┌─────────────────┐              │
                       │   Download      │ <────────────┘
                       │                 │
                       │ • ZIP Archive   │
                       │ • Individual    │
                       │   WAV Files     │
                       └─────────────────┘
```

## 🔧 Core Components

### Audio Processing Pipeline

1. **File Input & Validation**
   - Accepts WAV and MP3 files
   - File size and format validation
   - Progress tracking during upload

2. **Audio Decoding & Caching**
   ```typescript
   // Smart caching system
   const cachedData = await audioCache.getCachedAudio(file);
   if (cachedData) {
     // Instant load from IndexedDB
   } else {
     // Decode and cache for future use
   }
   ```

3. **Volume Analysis Algorithm**
   ```typescript
   // Multi-criteria split detection
   - Volume threshold analysis (dB-based)
   - Sustained volume drop detection  
   - Local minimum identification
   - Confidence scoring system
   ```

4. **Waveform Visualization**
   - HTML5 Canvas rendering
   - Real-time zoom and scroll
   - Split markers with drag handles
   - Performance optimization for long files

### State Management

```typescript
interface Split {
  id: string;
  name: string;        // "Song 1", "Song 2", etc.
  startTime: number;   // seconds
  endTime: number;     // seconds
}

// Main application state
- audioFile: File
- audioData: Float32Array  // Raw PCM data
- splits: Split[]          // Detected/edited splits
- isPlaying: boolean       // Playback state
```

### Caching Architecture

```
┌─────────────────────────────────────────────┐
│                IndexedDB                    │
├─────────────────────────────────────────────┤
│ Key: fileHash (name + size + modified + content) │
│                                             │
│ Value: {                                    │
│   audioData: Float32Array,                  │
│   sampleRate: number,                       │
│   duration: number,                         │
│   metadata: { fileName, fileSize, ... }    │
│ }                                           │
└─────────────────────────────────────────────┘
```

## 🎛️ Split Detection Algorithm

### Multi-Criteria Analysis

The application uses a sophisticated algorithm that combines multiple detection methods:

1. **Volume Threshold Detection**
   - Configurable dB threshold (-60 to -10 dB)
   - Relative to average volume of entire recording
   - Accounts for background noise in live recordings

2. **Sustained Volume Analysis** 
   - Looks for prolonged quiet periods (not just momentary silence)
   - Smoothing window to ignore brief interruptions
   - Minimum silence duration requirements

3. **Pattern Recognition**
   - Local minimum detection (valleys in waveform)
   - Context-aware thresholding
   - Confidence scoring for each potential split

4. **Musical Intelligence**
   - Minimum song duration enforcement
   - Gap analysis between potential songs
   - Overlap prevention

### User Controls

```typescript
interface SplitSettings {
  sensitivityDb: number;      // -30 dB (threshold)
  smoothingWindow: number;    // 5s (noise reduction) 
  minSilenceDuration: number; // 2s (gap duration)
  minSongDuration: number;    // 30s (song length)
}
```

## 📁 Project Structure

```
src/
├── components/
│   ├── AudioSplitterApp.tsx    # Main application component
│   ├── FileUpload.tsx          # Drag & drop file input
│   ├── AudioProcessor.tsx      # Core processing & UI
│   └── ui/                     # shadcn/ui components
├── lib/
│   ├── audioCache.ts           # IndexedDB caching system
│   └── utils.ts                # Utility functions
└── styles/
    └── globals.css             # Tailwind CSS styles
```

## 🚀 Performance Optimizations

### Large File Handling
- **Sample Skipping**: For files >10 minutes, skips samples during rendering
- **Progressive Rendering**: Uses requestAnimationFrame for smooth UI
- **Memory Management**: Efficient Float32Array handling

### Caching Strategy
- **Persistent Storage**: IndexedDB for large audio data
- **Smart Invalidation**: Detects file changes and updates cache
- **Automatic Cleanup**: Removes cache entries older than 7 days
- **Size Monitoring**: Tracks storage usage

### Real-time Interaction
- **Optimized Waveform**: Canvas-based rendering with zoom support
- **Drag Performance**: Efficient mouse event handling
- **State Management**: Minimal re-renders using React patterns

## 🔍 Debug Features

Enable debug mode for comprehensive logging:

- **Audio Processing**: Decode timing, cache hits/misses
- **Split Detection**: Algorithm decisions, confidence scores  
- **Mouse Interactions**: Hover detection, drag coordinates
- **State Changes**: Component re-renders, data updates
- **Cache Operations**: Storage/retrieval operations

## 🎯 Future Enhancements

- **Format Support**: Additional audio formats (FLAC, OGG)
- **AI Enhancement**: Machine learning for better split detection
- **Metadata Extraction**: Automatic song title recognition
- **Cloud Integration**: Optional cloud storage for large files
- **Batch Processing**: Multiple files at once
- **Audio Effects**: Fade in/out, normalization, noise reduction

---

## 🚀 Getting Started

```bash
# Install dependencies
npm install

# Ensure you're using Node 18.20.8+ or 20+
fnm use 20  # if using fnm

# Start development server  
npm run dev

# Build for production
npm run build
```

The application runs entirely in the browser - no backend server required!

## 🎛️ Usage

1. **Upload Audio**: Drag & drop or select your WAV/MP3 rehearsal recording
2. **Auto-Split**: The app automatically detects song boundaries using volume analysis
3. **Fine-tune**: Use the interactive waveform to adjust split points by dragging
4. **Preview**: Click play buttons to preview individual songs
5. **Export**: Download all splits as individual WAV files in a ZIP archive

## 🐛 Debugging

Click the "🐛 Debug" button to enable comprehensive console logging. This helps track:
- Audio processing steps
- Cache operations
- Split detection algorithm decisions
- Mouse interactions and waveform rendering

## 📝 Notes

- **File Size**: No limits - handles multi-hour recordings efficiently
- **Privacy**: All processing happens locally, no data sent to servers
- **Browser Support**: Modern browsers with Web Audio API support
- **Performance**: Optimized for large files with smart caching and sample reduction