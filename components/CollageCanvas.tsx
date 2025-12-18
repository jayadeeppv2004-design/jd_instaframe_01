import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { ProcessedImage, CollageSettings } from '../types';

interface CollageCanvasProps {
  images: ProcessedImage[];
  settings: CollageSettings;
  scale?: number; // Legacy prop, can be ignored or used for initial sizing
  zoom?: number; // Controls the display size (1 = 500px width)
}

export interface CollageCanvasHandle {
  exportImage: () => string; // Returns data URL
}

// Reference dimensions (High Quality / 300 DPI)
const REF_WIDTH = 2480;

const getDimensions = (quality: 'high' | 'medium' | 'low') => {
  switch (quality) {
    case 'low': 
      return { width: 595, height: 842, qualityParam: 0.7 }; // ~72 DPI
    case 'medium': 
      return { width: 1240, height: 1754, qualityParam: 0.85 }; // ~150 DPI
    case 'high': 
    default: 
      return { width: 2480, height: 3508, qualityParam: 0.95 }; // ~300 DPI
  }
};

interface LoadedImage {
  img: HTMLImageElement;
  rotation: number;
}

const CollageCanvas = forwardRef<CollageCanvasHandle, CollageCanvasProps>(({ images, settings, scale = 0.2, zoom = 1 }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(ref, () => ({
    exportImage: () => {
      const canvas = canvasRef.current;
      if (!canvas) return '';
      const { qualityParam } = getDimensions(settings.quality);
      return canvas.toDataURL('image/jpeg', qualityParam);
    }
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || images.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = getDimensions(settings.quality);
    
    // Update canvas size to match quality setting
    // This is crucial for the export resolution
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    // Calculate scale factor relative to reference (High Quality)
    // This ensures gaps/padding look consistent regardless of resolution
    const scaleFactor = width / REF_WIDTH;

    // Determine effective padding and gap based on borderless setting and scale
    const padding = settings.borderless ? 0 : (settings.padding * scaleFactor);
    const gap = settings.borderless ? 0 : (settings.gap * scaleFactor);
    const backgroundColor = settings.backgroundColor;

    // Clear canvas
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    const drawImageInRect = (imageObj: LoadedImage, x: number, y: number, w: number, h: number) => {
        const { img, rotation } = imageObj;

        // Draw background for cell
        if (!settings.borderless && !settings.polaroid) {
            ctx.fillStyle = '#e2e8f0';
            ctx.fillRect(x, y, w, h);
        }
        
        ctx.save();
        
        // Clip to cell area
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();

        // Translate to center of cell
        ctx.translate(x + w / 2, y + h / 2);
        
        // Apply rotation
        ctx.rotate((rotation * Math.PI) / 180);

        // Determine available space in the rotated context
        // If 90/270 degrees, width and height of the visual cell are swapped in the local coordinate system
        const isVertical = rotation % 180 !== 0;
        const localW = isVertical ? h : w;
        const localH = isVertical ? w : h;

        if (settings.polaroid) {
             // Polaroid Frame Logic
             const frameScale = 0.92; // Slight scaling to allow gap/shadow
             const paperW = localW * frameScale;
             const paperH = localH * frameScale;
             
             // Draw Shadow
             ctx.shadowColor = 'rgba(0,0,0,0.3)';
             ctx.shadowBlur = 20 * scaleFactor;
             ctx.shadowOffsetX = 2 * scaleFactor;
             ctx.shadowOffsetY = 4 * scaleFactor;

             // Draw Paper
             ctx.fillStyle = '#ffffff';
             ctx.fillRect(-paperW/2, -paperH/2, paperW, paperH);

             // Reset Shadow for image
             ctx.shadowColor = 'transparent';
             ctx.shadowBlur = 0;
             ctx.shadowOffsetX = 0;
             ctx.shadowOffsetY = 0;

             // Calculate Inner Image Area
             const pad = Math.min(paperW, paperH) * 0.05;
             const bottomPad = Math.min(paperW, paperH) * 0.20; // Thicker bottom for classic look

             const imgAreaW = paperW - (2 * pad);
             const imgAreaH = paperH - pad - bottomPad;
             
             // Center of the image area relative to the paper center
             const imgAreaCenterX = 0;
             const imgAreaCenterY = (pad - bottomPad) / 2;

             // Draw Image inside the defined area
             // "Cover" logic for the image area
             const imgW = img.width;
             const imgH = img.height;
             const imgRatio = imgW / imgH;
             const targetRatio = imgAreaW / imgAreaH;
             
             let scale;
             if (imgRatio > targetRatio) {
                 scale = imgAreaH / imgH;
             } else {
                 scale = imgAreaW / imgW;
             }

             // Clip to image area to handle overflow from 'cover' scaling
             ctx.save();
             ctx.beginPath();
             ctx.rect(
                imgAreaCenterX - imgAreaW / 2, 
                imgAreaCenterY - imgAreaH / 2, 
                imgAreaW, 
                imgAreaH
             );
             ctx.clip();
             
             // Draw Image
             ctx.drawImage(
                img,
                imgAreaCenterX - (imgW * scale) / 2,
                imgAreaCenterY - (imgH * scale) / 2,
                imgW * scale,
                imgH * scale
             );
             ctx.restore();

        } else {
            // Standard "Cover" logic filling the cell
            
            // Calculate effective dimensions based on rotation relative to the original image orientation
            // Note: The context is already rotated. We are drawing the image upright in this rotated context.
            // The constraint box is 'localW' x 'localH'.
            
            const imgW = img.width;
            const imgH = img.height;

            const imgRatio = imgW / imgH;
            const cellRatio = localW / localH;
            
            let scale;
            if (imgRatio > cellRatio) {
                 scale = localH / imgH; 
            } else {
                 scale = localW / imgW;
            }

            ctx.drawImage(
                img, 
                -imgW * scale / 2, 
                -imgH * scale / 2, 
                imgW * scale, 
                imgH * scale
            );
        }

        ctx.restore();
    };

    // Helper to load image
    const loadImage = (src: string): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = src;
            img.onload = () => resolve(img);
            img.onerror = () => resolve(img); // resolve anyway to continue
        });
    };

    const render = async () => {
        // Load all needed images first
        let needed = images;
        if (settings.template !== 'grid') {
             const limit = settings.template.startsWith('3') ? 3 : 4;
             needed = images.slice(0, limit);
        }
        
        const loadedImages = await Promise.all(needed.map(async (data) => ({
            img: await loadImage(data.src),
            rotation: data.rotation
        })));

        const availableWidth = width - (padding * 2);
        const availableHeight = height - (padding * 2);

        // --- GRID LAYOUT (Default / Fallback) ---
        if (settings.template === 'grid') {
            const cols = settings.columns;
            const rows = Math.ceil(loadedImages.length / cols);
            
            const cellWidth = (availableWidth - ((cols - 1) * gap)) / cols;
            
            let cellHeight = cellWidth; // Default square
            if (settings.borderless || rows > 0) {
                 // Try to fit nicely in height
                 cellHeight = (availableHeight - ((rows - 1) * gap)) / rows;
            }

            loadedImages.forEach((imageObj, i) => {
                const colIndex = i % cols;
                const rowIndex = Math.floor(i / cols);
                const x = padding + (colIndex * (cellWidth + gap));
                const y = padding + (rowIndex * (cellHeight + gap));
                drawImageInRect(imageObj, x, y, cellWidth, cellHeight);
            });
            return;
        }

        // --- 3 IMAGE TEMPLATES ---
        if (settings.template === '3-vertical') {
            const w = (availableWidth - (2 * gap)) / 3;
            const h = availableHeight;
            loadedImages.forEach((imageObj, i) => {
                if (i > 2) return;
                const x = padding + (i * (w + gap));
                drawImageInRect(imageObj, x, padding, w, h);
            });
        }
        else if (settings.template === '3-horizontal') {
            const w = availableWidth;
            const h = (availableHeight - (2 * gap)) / 3;
            loadedImages.forEach((imageObj, i) => {
                if (i > 2) return;
                const y = padding + (i * (h + gap));
                drawImageInRect(imageObj, padding, y, w, h);
            });
        }
        else if (settings.template === '3-mixed') {
            // 1 Top (Landscape), 2 Bottom (Squares)
            const topH = (availableHeight - gap) / 2;
            const botH = topH;
            const botW = (availableWidth - gap) / 2;

            if (loadedImages[0]) drawImageInRect(loadedImages[0], padding, padding, availableWidth, topH);
            if (loadedImages[1]) drawImageInRect(loadedImages[1], padding, padding + topH + gap, botW, botH);
            if (loadedImages[2]) drawImageInRect(loadedImages[2], padding + botW + gap, padding + topH + gap, botW, botH);
        }

        // --- 4 IMAGE TEMPLATES ---
        else if (settings.template === '4-grid') {
            // 2x2 Grid
            const w = (availableWidth - gap) / 2;
            const h = (availableHeight - gap) / 2;
            
            if (loadedImages[0]) drawImageInRect(loadedImages[0], padding, padding, w, h);
            if (loadedImages[1]) drawImageInRect(loadedImages[1], padding + w + gap, padding, w, h);
            if (loadedImages[2]) drawImageInRect(loadedImages[2], padding, padding + h + gap, w, h);
            if (loadedImages[3]) drawImageInRect(loadedImages[3], padding + w + gap, padding + h + gap, w, h);
        }
        else if (settings.template === '4-rows') {
             // 4 Horizontal strips
            const w = availableWidth;
            const h = (availableHeight - (3 * gap)) / 4;
            loadedImages.forEach((imageObj, i) => {
                if (i > 3) return;
                const y = padding + (i * (h + gap));
                drawImageInRect(imageObj, padding, y, w, h);
            });
        }
    };

    render();

  }, [images, settings]);

  return (
    <div className="relative shadow-2xl overflow-hidden rounded-sm bg-white transition-all duration-300 ease-in-out" style={{ width: '100%', maxWidth: `${500 * zoom}px`, aspectRatio: '210/297' }}>
       {/* Canvas dimensions are controlled by internal logic, CSS controls display size */}
       <canvas 
        ref={canvasRef}
        className="w-full h-full object-contain origin-top-left"
       />
    </div>
  );
});

CollageCanvas.displayName = 'CollageCanvas';

export default CollageCanvas;