import { ProcessedImage } from '../types';

export const processImageFile = (file: File): Promise<ProcessedImage> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      if (!src) {
        reject(new Error("Failed to read image"));
        return;
      }
      resolve({
        id: crypto.randomUUID(),
        src,
        originalName: file.name,
        timestamp: Date.now(),
        rotation: 0
      });
    };
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
};

export const extractFrameFromVideo = (file: File): Promise<ProcessedImage> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);

    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    // Wait for metadata to load to know duration, but usually we just want a frame immediately.
    // Instagram stories often start with the image immediately. 
    // We aim for 0.1s to avoid potential black frames at strict 0.0s in some encodings.
    video.currentTime = 0.1;

    const handleLoadedData = () => {
      // Ensure we are ready to draw
      if (video.readyState >= 2) {
         capture();
      }
    };

    const handleSeeked = () => {
      capture();
    };

    const capture = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        
        // Cleanup
        URL.revokeObjectURL(url);
        video.remove();

        resolve({
          id: crypto.randomUUID(),
          src: dataUrl,
          originalName: file.name,
          timestamp: Date.now(),
          rotation: 0
        });
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('error', (e) => {
      URL.revokeObjectURL(url);
      reject(new Error(`Video load error: ${video.error?.message}`));
    });

    // Timeout safety
    setTimeout(() => {
        URL.revokeObjectURL(url);
        reject(new Error("Timeout processing video"));
    }, 10000);
  });
};

// Batch processor to prevent memory overload with 100+ files
export const processBatch = async (
  files: File[], 
  onProgress: (completed: number, total: number) => void
): Promise<ProcessedImage[]> => {
  const results: ProcessedImage[] = [];
  const batchSize = 5; // Process 5 at a time
  
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const promises = batch.map(file => {
        if (file.type.startsWith('image/')) {
            return processImageFile(file).catch(e => {
                console.error(`Failed to process image ${file.name}`, e);
                return null;
            });
        } else if (file.type.startsWith('video/')) {
             return extractFrameFromVideo(file).catch(e => {
                console.error(`Failed to process video ${file.name}`, e);
                return null;
            });
        }
        return Promise.resolve(null);
    });
    
    const batchResults = await Promise.all(promises);
    
    batchResults.forEach(res => {
      if (res) results.push(res);
    });

    onProgress(Math.min(i + batchSize, files.length), files.length);
  }

  return results;
};

// --- Cropping Utilities ---

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });

function getRadianAngle(degreeValue: number) {
  return (degreeValue * Math.PI) / 180;
}

/**
 * Returns the new bounding area of a rotated rectangle.
 */
function rotateSize(width: number, height: number, rotation: number) {
  const rotRad = getRadianAngle(rotation);

  return {
    width:
      Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height:
      Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
}

export const getCroppedImg = async (
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number },
  rotation = 0,
  flip = { horizontal: false, vertical: false }
): Promise<string> => {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('No 2d context');
  }

  const rotRad = getRadianAngle(rotation);

  // calculate bounding box of the rotated image
  const { width: bBoxWidth, height: bBoxHeight } = rotateSize(
    image.width,
    image.height,
    rotation
  );

  // set canvas size to match the bounding box
  canvas.width = bBoxWidth;
  canvas.height = bBoxHeight;

  // translate canvas context to a central location to allow rotating and flipping around the center
  ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  ctx.rotate(rotRad);
  ctx.scale(flip.horizontal ? -1 : 1, flip.vertical ? -1 : 1);
  ctx.translate(-image.width / 2, -image.height / 2);

  // draw rotated image
  ctx.drawImage(image, 0, 0);

  // croppedAreaPixels values are bounding box relative
  // extract the cropped image using these values
  const data = ctx.getImageData(
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height
  );

  // set canvas width to final desired crop size - this will clear existing context
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  // paste generated rotate image at the top left corner
  ctx.putImageData(data, 0, 0);

  // As Base64 string
  return canvas.toDataURL('image/jpeg', 0.95);
};