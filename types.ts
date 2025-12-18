export interface ProcessedImage {
  id: string;
  src: string; // Base64 or Blob URL
  originalName: string;
  timestamp: number;
  rotation: number; // 0, 90, 180, 270
}

export type TemplateId = 'grid' | '3-vertical' | '3-horizontal' | '3-mixed' | '4-grid' | '4-rows';

export interface CollageSettings {
  columns: number;
  gap: number; // in pixels (relative to print size)
  backgroundColor: string;
  padding: number;
  quality: 'high' | 'medium' | 'low';
  template: TemplateId;
  borderless: boolean;
  limit: number; // Max items per page
  polaroid: boolean; // New setting
}

export type ProcessingStatus = 'idle' | 'processing' | 'complete' | 'error';