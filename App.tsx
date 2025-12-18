import React, { useState, useRef, useEffect } from 'react';
import { Upload, Image as ImageIcon, Download, Settings, Loader2, X, Grid, Layout, Columns, LayoutTemplate, Trash2, Eye, ChevronLeft, ChevronRight, FileText, RotateCw, ZoomIn, ZoomOut, RotateCcw, Crop, Check, Camera } from 'lucide-react';
import { jsPDF } from 'jspdf';
import Cropper from 'react-easy-crop';
import { processBatch, getCroppedImg } from './services/videoProcessor';
// This was likely missing or breaking the build!
import CollageCanvas, { CollageCanvasHandle } from './components/CollageCanvas';
import { ProcessedImage, CollageSettings, ProcessingStatus, TemplateId } from './types';

const INITIAL_SETTINGS: CollageSettings = {
  columns: 2,
  gap: 0,
  backgroundColor: '#ffffff',
  padding: 0,
  quality: 'high',
  template: '4-grid',
  borderless: true,
  limit: 4,
  polaroid: false
};

interface Point {
  x: number;
  y: number;
}
interface Area {
  width: number;
  height: number;
  x: number;
  y: number;
}

const App = () => {
  const [images, setImages] = useState<ProcessedImage[]>([]);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [settings, setSettings] = useState<CollageSettings>(INITIAL_SETTINGS);

  const [showReview, setShowReview] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState('');
  const [zoom, setZoom] = useState(1);

  const [croppingImageId, setCroppingImageId] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [cropZoom, setCropZoom] = useState(1);
  const [cropRotation, setCropRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const canvasRef = useRef<CollageCanvasHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getItemsPerPage = () => {
    switch (settings.template) {
        case 'grid': return settings.limit || 4;
        case '3-vertical':
        case '3-horizontal':
        case '3-mixed': return 3;
        case '4-grid':
        case '4-rows': return 4;
        default: return 4;
    }
  };

  const itemsPerPage = getItemsPerPage();
  const totalPages = Math.ceil(images.length / itemsPerPage) || 1;
  const currentImages = images.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const croppingImage = images.find(img => img.id === croppingImageId);

  useEffect(() => {
    if (currentPage > totalPages) {
        setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) return;
    
    const files = Array.from(event.target.files) as File[];
    setStatus('processing');
    setProgress(0);
    setImages([]); 
    setCurrentPage(1);

    try {
      const processed = await processBatch(files, (completed, total) => {
        setProgress(Math.round((completed / total) * 100));
      });
      setImages(processed);
      setStatus('complete');
      
      const count = processed.length;
      if (count >= 4) {
          setSettings(prev => ({ ...prev, template: '4-grid', borderless: true, gap: 0, padding: 0 }));
      } else {
          setSettings(prev => ({ ...prev, template: 'grid', columns: Math.ceil(Math.sqrt(count)), limit: count }));
      }
    } catch (error) {
      console.error(error);
      setStatus('error');
    }
  };

  const removeImage = (id: string) => setImages(prev => prev.filter(img => img.id !== id));
  
  const rotateImage = (id: string) => {
    setImages(prev => prev.map(img => {
      if (img.id === id) return { ...img, rotation: (img.rotation + 90) % 360 };
      return img;
    }));
  };

  const startCropping = (image: ProcessedImage) => {
      setCroppingImageId(image.id);
      setCrop({ x: 0, y: 0 });
      setCropZoom(1);
      setCropRotation(image.rotation);
  };

  const onCropComplete = (croppedArea: Area, croppedAreaPixels: Area) => setCroppedAreaPixels(croppedAreaPixels);

  const handleCropSave = async () => {
    if (!croppingImage || !croppedAreaPixels) return;
    try {
        const croppedImageSrc = await getCroppedImg(croppingImage.src, croppedAreaPixels, cropRotation);
        setImages(prev => prev.map(img => {
            if (img.id === croppingImageId) return { ...img, src: croppedImageSrc, rotation: 0 };
            return img;
        }));
        setCroppingImageId(null);
    } catch (e) {
        console.error(e);
        alert("Failed to crop image");
    }
  };

  const handleDownloadPage = (pageNumber?: number) => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.exportImage();
    const link = document.createElement('a');
    const pageNum = pageNumber || currentPage;
    link.download = `insta-collage-page-${pageNum}-${Date.now()}.jpg`;
    link.href = dataUrl;
    link.click();
  };

  const handleDownloadPDF = async () => {
    if (images.length === 0) return;
    setIsDownloadingAll(true);
    setDownloadStatus('Initializing PDF...');
    try {
        const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
        const pageWidth = 210;
        const pageHeight = 297;
        for (let i = 1; i <= totalPages; i++) {
            setDownloadStatus(`Rendering Page ${i}/${totalPages}...`);
            setCurrentPage(i);
            await new Promise(resolve => setTimeout(resolve, 800)); 
            if (canvasRef.current) {
                const imgData = canvasRef.current.exportImage();
                if (i > 1) pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'MEDIUM');
            }
        }
        setDownloadStatus('Saving PDF...');
        pdf.save(`insta-collage-full-${Date.now()}.pdf`);
    } catch (e) {
        console.error("PDF Generation failed", e);
        alert("Failed to generate PDF.");
    } finally {
        setIsDownloadingAll(false);
        setDownloadStatus('');
    }
  };

  const TemplateButton = ({ id, label, icon: Icon, onClick }: { id: TemplateId, label: string, icon: any, onClick?: () => void }) => (
    <button
      onClick={() => {
          if (onClick) onClick();
          else setSettings({ ...settings, template: id });
          setCurrentPage(1); 
      }}
      className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${
        settings.template === id ? 'border-pink-500 bg-slate-700 text-pink-400' : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500'
      }`}
    >
      <Icon className="w-6 h-6 mb-2" />
      <span className="text-[10px] uppercase tracking-wider">{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col md:flex-row font-sans">
      {croppingImageId && croppingImage && (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col animate-in fade-in duration-200">
           <div className="p-4 flex justify-between items-center bg-slate-900/80 backdrop-blur-md z-10 border-b border-slate-800">
                <h3 className="text-lg font-bold text-white">Crop Image</h3>
                <div className="flex gap-2">
                    <button onClick={() => setCroppingImageId(null)} className="px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">Cancel</button>
                    <button onClick={handleCropSave} className="px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg font-medium flex items-center gap-2"><Check className="w-4 h-4" /> Apply Crop</button>
                </div>
           </div>
           <div className="flex-1 relative bg-black">
                <Cropper image={croppingImage.src} crop={crop} zoom={cropZoom} rotation={cropRotation} aspect={undefined} onCropChange={setCrop} onCropComplete={onCropComplete} onZoomChange={setCropZoom} onRotationChange={setCropRotation} />
           </div>
           <div className="p-6 bg-slate-900 border-t border-slate-800 pb-10">
                <div className="max-w-xl mx-auto space-y-4">
                    <div className="flex items-center gap-4">
                        <span className="text-xs font-medium w-16 text-slate-400">Zoom</span>
                        <ZoomOut className="w-4 h-4 text-slate-500" />
                        <input type="range" value={cropZoom} min={1} max={3} step={0.1} onChange={(e) => setCropZoom(Number(e.target.value))} className="flex-1 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-pink-500" />
                        <ZoomIn className="w-4 h-4 text-slate-500" />
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-xs font-medium w-16 text-slate-400">Rotate</span>
                        <RotateCcw className="w-4 h-4 text-slate-500" />
                        <input type="range" value={cropRotation} min={0} max={360} step={1} onChange={(e) => setCropRotation(Number(e.target.value))} className="flex-1 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-pink-500" />
                        <RotateCw className="w-4 h-4 text-slate-500" />
                    </div>
                </div>
           </div>
        </div>
      )}

      {showReview && !croppingImageId && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-sm flex flex-col p-6 animate-in fade-in duration-200">
            <div className="flex justify-between items-center mb-6 max-w-7xl mx-auto w-full">
                <div><h2 className="text-2xl font-bold text-white flex items-center gap-2"><Eye className="w-6 h-6 text-pink-500"/> Review Gallery</h2><p className="text-slate-400 text-sm">Review photos before generating collage.</p></div>
                <button onClick={() => setShowReview(false)} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full transition-colors"><X className="w-6 h-6" /></button>
            </div>
            <div className="flex-1 overflow-y-auto max-w-7xl mx-auto w-full">
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                    {images.map((img, idx) => (
                        <div key={img.id} className="relative group aspect-square bg-slate-900 rounded-lg overflow-hidden border border-slate-800 hover:border-pink-500 transition-all">
                            <div className="w-full h-full overflow-hidden flex items-center justify-center bg-black">
                                <img src={img.src} alt="frame" className="max-w-full max-h-full object-contain transition-transform duration-300" style={{ transform: `rotate(${img.rotation}deg)` }} />
                            </div>
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3">
                                <div className="flex items-center gap-2">
                                    <button onClick={() => rotateImage(img.id)} className="p-2 bg-slate-200 hover:bg-white text-slate-900 rounded-full transform hover:scale-110 transition-all"><RotateCw className="w-4 h-4" /></button>
                                    <button onClick={() => startCropping(img)} className="p-2 bg-blue-500 hover:bg-blue-400 text-white rounded-full transform hover:scale-110 transition-all"><Crop className="w-4 h-4" /></button>
                                    <button onClick={() => removeImage(img.id)} className="p-2 bg-red-500 hover:bg-red-400 rounded-full text-white transform hover:scale-110 transition-all"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </div>
                            <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 rounded text-[10px] text-white">#{idx + 1}</div>
                        </div>
                    ))}
                </div>
                {images.length === 0 && <div className="h-full flex items-center justify-center text-slate-500">No images found.</div>}
            </div>
            <div className="mt-4 flex justify-center"><button onClick={() => setShowReview(false)} className="px-8 py-3 bg-pink-600 hover:bg-pink-500 text-white rounded-lg font-medium">Done Reviewing</button></div>
        </div>
      )}

      <aside className="w-full md:w-96 bg-slate-800 border-r border-slate-700 p-6 flex flex-col gap-8 overflow-y-auto z-10 shadow-xl md:h-screen md:sticky md:top-0">
        <div><h1 className="text-2xl font-bold bg-gradient-to-r from-pink-500 to-violet-500 bg-clip-text text-transparent mb-2">InstaFrame</h1><p className="text-sm text-slate-400">Batch Video & Photo to Collage</p></div>
        <div className="space-y-4">
          <label className="block text-sm font-medium text-slate-300">1. Upload Media</label>
          <button onClick={() => fileInputRef.current?.click()} className="w-full h-24 border-2 border-dashed border-slate-600 rounded-xl flex flex-col items-center justify-center hover:border-pink-500 hover:bg-slate-700/50 transition-all group">
            <Upload className="w-6 h-6 text-slate-500 group-hover:text-pink-400 mb-2 transition-colors" /><span className="text-xs text-slate-400 group-hover:text-slate-200">Select files (Videos & Photos)</span>
          </button>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple accept="video/*,image/*" className="hidden" />
          {status === 'processing' && (
            <div className="space-y-2 animate-in fade-in"><div className="flex justify-between text-xs text-slate-400"><span>Processing...</span><span>{progress}%</span></div><div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-pink-500 transition-all duration-300" style={{ width: `${progress}%` }} /></div></div>
          )}
          {images.length > 0 && (
            <button onClick={() => setShowReview(true)} className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors border border-slate-600"><Eye className="w-4 h-4" /> Review / Remove Photos ({images.length})</button>
          )}
        </div>

        {images.length > 0 && (
          <div className="space-y-8 animate-in slide-in-from-left-4 fade-in duration-500">
            <div className="space-y-3">
               <label className="block text-sm font-medium text-slate-300 flex items-center gap-2"><LayoutTemplate className="w-4 h-4" /> 2. Choose Template</label>
              <div className="grid grid-cols-3 gap-2">
                 <TemplateButton id="4-grid" label="4 Box (2x2)" icon={Grid} />
                 <button onClick={() => { setSettings({ ...settings, template: 'grid' }); setCurrentPage(1); }} className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${settings.template === 'grid' ? 'border-pink-500 bg-slate-700 text-pink-400' : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500'}`}><Grid className="w-6 h-6 mb-2" /><span className="text-[10px] uppercase tracking-wider">Dynamic</span></button>
                 <button onClick={() => { setSettings({ ...settings, template: 'grid', limit: 3, columns: 1 }); setCurrentPage(1); }} className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${settings.template === 'grid' && settings.limit === 3 ? 'border-pink-500 bg-slate-700 text-pink-400' : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500'}`}><Columns className="w-6 h-6 mb-2" /><span className="text-[10px] uppercase tracking-wider">3 Stack</span></button>
                 <TemplateButton id="3-mixed" label="3 Mixed" icon={Layout} />
                 <TemplateButton id="4-rows" label="4 Rows" icon={Layout} />
                 <TemplateButton id="3-horizontal" label="3 Rows" icon={Layout} />
              </div>
               {settings.template === 'grid' && (
                   <div className="bg-slate-700/30 p-3 rounded-lg border border-slate-700 space-y-3 mt-2">
                       <div><div className="flex justify-between text-xs text-slate-300 mb-1"><span>Photos per Page</span><span className="font-bold text-pink-400">{settings.limit}</span></div><input type="range" min="1" max="20" value={settings.limit} onChange={(e) => { setSettings({...settings, limit: Number(e.target.value)}); setCurrentPage(1); }} className="w-full accent-pink-500 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer" /></div>
                       <div><div className="flex justify-between text-xs text-slate-300 mb-1"><span>Columns</span><span className="font-bold text-pink-400">{settings.columns}</span></div><input type="range" min="1" max="5" value={settings.columns} onChange={(e) => setSettings({...settings, columns: Number(e.target.value)})} className="w-full accent-pink-500 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer" /></div>
                   </div>
               )}
            </div>
            <div className="space-y-4 border-t border-slate-700 pt-6">
              <label className="block text-sm font-medium text-slate-300 flex items-center gap-2 justify-between">
                <span className="flex items-center gap-2"><Settings className="w-4 h-4" /> 3. Adjustments</span>
                <label className="flex items-center gap-2 cursor-pointer group"><input type="checkbox" checked={settings.borderless} onChange={(e) => setSettings({...settings, borderless: e.target.checked})} className="w-4 h-4 rounded border-slate-600 accent-pink-500" /><span className="text-xs text-slate-400 group-hover:text-white transition-colors">Borderless</span></label>
              </label>
              <label className="flex items-center justify-between p-3 rounded-lg bg-slate-800 border border-slate-700 cursor-pointer hover:border-pink-500 transition-colors">
                  <div className="flex items-center gap-3"><Camera className={`w-5 h-5 ${settings.polaroid ? 'text-pink-500' : 'text-slate-400'}`} /><div><span className="text-sm font-medium text-slate-200 block">Polaroid Frame</span><span className="text-[10px] text-slate-500 block">Add classic photo borders</span></div></div>
                  <div className={`w-10 h-6 rounded-full p-1 transition-colors ${settings.polaroid ? 'bg-pink-600' : 'bg-slate-600'}`}><div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${settings.polaroid ? 'translate-x-4' : ''}`} /></div>
                  <input type="checkbox" className="hidden" checked={settings.polaroid} onChange={(e) => setSettings({...settings, polaroid: e.target.checked})} />
              </label>
              <div className={`space-y-4 transition-opacity ${settings.borderless ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                <div className="space-y-1"><div className="flex justify-between text-xs text-slate-400"><span>Gap</span><span>{settings.gap}px</span></div><input type="range" min="0" max="100" value={settings.gap} onChange={(e) => setSettings({...settings, gap: Number(e.target.value)})} className="w-full accent-pink-500 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer" /></div>
              </div>
               <div className="space-y-1 pt-2">
                  <div className="flex justify-between text-xs text-slate-400"><span>Background</span></div>
                  <div className="flex gap-2 flex-wrap">{['#ffffff', '#000000', '#fce7f3', '#e0f2fe', '#fef3c7', '#f1f5f9'].map(color => (<button key={color} onClick={() => setSettings({...settings, backgroundColor: color})} className={`w-6 h-6 rounded-full border-2 ${settings.backgroundColor === color ? 'border-pink-500 scale-110' : 'border-transparent'} transition-all`} style={{backgroundColor: color}} />))}<input type="color" value={settings.backgroundColor} onChange={(e) => setSettings({...settings, backgroundColor: e.target.value})} className="w-6 h-6 rounded-full bg-transparent overflow-hidden cursor-pointer p-0 border-0" /></div>
                </div>
            </div>
            <div className="pt-4 border-t border-slate-700 space-y-3">
                 <div className="flex justify-between items-center text-xs text-slate-400 mb-2"><span>Total Pages: <span className="text-white font-bold">{totalPages}</span></span><span>Total Photos: <span className="text-white font-bold">{images.length}</span></span></div>
                {isDownloadingAll ? (<button disabled className="w-full py-3 bg-slate-700 text-slate-300 rounded-lg font-medium flex items-center justify-center gap-2 cursor-wait"><Loader2 className="w-4 h-4 animate-spin" /> {downloadStatus || 'Processing...'}</button>) : (<><button onClick={() => handleDownloadPage()} className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"><Download className="w-4 h-4" /> Download Current Page</button>{totalPages > 1 && (<button onClick={handleDownloadPDF} className="w-full py-3 bg-pink-600 hover:bg-pink-500 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors shadow-lg shadow-pink-900/20"><FileText className="w-4 h-4" /> Download Full PDF</button>)}</>)}
            </div>
          </div>
        )}
      </aside>

      <main className="flex-1 bg-slate-950 p-4 md:p-10 flex flex-col items-center justify-start overflow-auto relative h-screen">
        {images.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 space-y-4">
             <div className="w-24 h-24 bg-slate-800 rounded-full flex items-center justify-center"><ImageIcon className="w-10 h-10 opacity-20" /></div><p>Upload videos to start generating your collage</p>
          </div>
        ) : (
          <div className={`w-full flex flex-col items-center gap-6 animate-in zoom-in-95 duration-500 pb-20 transition-all ${zoom > 1 ? '' : 'max-w-4xl'}`}>
             <div className="w-full max-w-[500px] flex justify-between items-center bg-slate-800/50 p-2 rounded-lg backdrop-blur-sm border border-slate-700 sticky top-0 z-30">
                 <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1 || isDownloadingAll} className="p-2 hover:bg-slate-700 rounded-lg disabled:opacity-30 transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                 <div className="flex flex-col items-center"><span className="text-sm font-medium text-slate-200">Page {currentPage} of {totalPages}</span><span className="text-[10px] text-slate-500">{settings.template === 'grid' ? `${settings.limit} items / ${settings.columns} cols` : `${itemsPerPage} items per page`}</span></div>
                 <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || isDownloadingAll} className="p-2 hover:bg-slate-700 rounded-lg disabled:opacity-30 transition-colors"><ChevronRight className="w-5 h-5" /></button>
             </div>
             <div className="relative z-10">
                 <CollageCanvas ref={canvasRef} images={currentImages} settings={settings} zoom={zoom} />
                 {isDownloadingAll && (<div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10 backdrop-blur-[2px]"><div className="bg-slate-800 px-4 py-2 rounded-lg shadow-xl border border-slate-700 flex items-center gap-3"><Loader2 className="w-5 h-5 text-pink-500 animate-spin" /><span className="text-sm font-medium">{downloadStatus || 'Processing...'}</span></div></div>)}
             </div>
             <div className="fixed bottom-8 right-8 z-40 flex items-center gap-2 bg-slate-800/90 backdrop-blur-md p-2 rounded-full border border-slate-700 shadow-2xl animate-in slide-in-from-bottom-5">
                 <button onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} className="p-2 hover:bg-slate-700 rounded-full text-slate-300 hover:text-white transition-colors" title="Zoom Out"><ZoomOut className="w-5 h-5" /></button>
                 <span className="text-xs font-mono w-12 text-center text-slate-300">{Math.round(zoom * 100)}%</span>
                 <button onClick={() => setZoom(z => Math.min(3, z + 0.25))} className="p-2 hover:bg-slate-700 rounded-full text-slate-300 hover:text-white transition-colors" title="Zoom In"><ZoomIn className="w-5 h-5" /></button>
                 <div className="w-px h-4 bg-slate-700 mx-1"></div>
                 <button onClick={() => setZoom(1)} className="p-2 hover:bg-slate-700 rounded-full text-slate-300 hover:text-white transition-colors" title="Reset Zoom"><RotateCcw className="w-4 h-4" /></button>
             </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
