// components/PdfUpload.tsx
import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { LoadingSpinner } from './LoadingSpinner';
import { ErrorMessage } from './ErrorMessage';

interface PdfUploadProps {
  onUpload: (file: File) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export const PdfUpload: React.FC<PdfUploadProps> = ({ onUpload, isLoading, error }) => {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      onUpload(acceptedFiles[0]);
    }
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
  });

  return (
    <div
      {...getRootProps()}
      className={`p-4 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors
        ${isDragActive ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}
    >
      <input {...getInputProps()} />
      {isLoading ? (
        <LoadingSpinner message="Processing PDF..." />
      ) : (
        <div>
          {isDragActive ? (
            <p className="text-primary">Drop the PDF here...</p>
          ) : (
            <p className="text-muted-foreground">Drag 'n' drop a PDF here, or click to select a file</p>
          )}
          {error && <ErrorMessage message={error} />}
        </div>
      )}
    </div>
  );
};
