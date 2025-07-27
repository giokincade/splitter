import React, { useState } from 'react';
import FileUpload from './FileUpload';
import AudioProcessor from './AudioProcessor';

export interface Split {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
}

export default function AudioSplitterApp() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [splits, setSplits] = useState<Split[]>([]);

  const handleFileSelect = (file: File) => {
    setAudioFile(file);
  };

  const handleBack = () => {
    setAudioFile(null);
    setSplits([]);
  };

  if (!audioFile) {
    return <FileUpload onFileSelect={handleFileSelect} />;
  }

  return (
    <AudioProcessor 
      audioFile={audioFile} 
      splits={splits}
      setSplits={setSplits}
      onBack={handleBack}
    />
  );
}