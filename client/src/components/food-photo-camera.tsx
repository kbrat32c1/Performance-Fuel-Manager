import { useState, useEffect, useRef, useCallback } from "react";
import { X, Camera, Loader2, ImagePlus } from "lucide-react";

interface FoodPhotoCameraProps {
  open: boolean;
  onClose: () => void;
  onCapture: (imageDataUrl: string) => void;
}

// Compress an image file/blob to JPEG dataUrl at target quality
function compressImage(file: File | Blob, maxDim = 1280, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        const scale = maxDim / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

export function FoodPhotoCamera({ open, onClose, onCapture }: FoodPhotoCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [flash, setFlash] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      stopCamera();
      setError(null);
      setStarting(true);
      return;
    }

    let cancelled = false;

    async function startCamera() {
      setStarting(true);
      setError(null);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
        });

        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStarting(false);
      } catch (e: any) {
        if (!cancelled) {
          console.error('Camera error:', e);
          setError(e.message || 'Camera access denied. Please allow camera access and try again.');
          setStarting(false);
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, stopCamera]);

  const handleCapture = useCallback(() => {
    if (!videoRef.current || capturing) return;
    setCapturing(true);

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setCapturing(false);
      return;
    }

    ctx.drawImage(video, 0, 0);

    // Compress to JPEG 0.7 quality (keeps under ~1MB for most photos)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

    // Flash effect
    setFlash(true);
    setTimeout(() => setFlash(false), 150);

    // Stop camera & return
    stopCamera();
    onCapture(dataUrl);
    setCapturing(false);
  }, [capturing, stopCamera, onCapture]);

  // Handle file upload from gallery
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCapturing(true);
    try {
      const dataUrl = await compressImage(file, 1280, 0.7);
      stopCamera();
      onCapture(dataUrl);
    } catch (err) {
      console.error('Image upload error:', err);
      setError('Failed to process image. Try a different photo.');
    } finally {
      setCapturing(false);
      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [stopCamera, onCapture]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      {/* Header — with safe-area padding for iOS notch */}
      <div className="flex items-center justify-between p-4 z-10 bg-gradient-to-b from-black/80 to-transparent" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-2 text-white">
          <Camera className="w-5 h-5" />
          <span className="text-sm font-medium">Snap Food Photo</span>
        </div>
        <button
          onClick={() => { stopCamera(); onClose(); }}
          className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 active:scale-95 transition-all"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Camera viewfinder */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />

        {/* Flash overlay */}
        {flash && (
          <div className="absolute inset-0 bg-white animate-pulse z-20" />
        )}

        {/* Corner guides */}
        {!starting && !error && (
          <div className="absolute inset-8 pointer-events-none">
            <div className="absolute top-0 left-0 w-10 h-10 border-t-2 border-l-2 border-white/60 rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-10 h-10 border-t-2 border-r-2 border-white/60 rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-10 h-10 border-b-2 border-l-2 border-white/60 rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-10 h-10 border-b-2 border-r-2 border-white/60 rounded-br-lg" />
          </div>
        )}

        {/* Loading */}
        {starting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mb-2" />
            <span className="text-sm text-white/80">Starting camera...</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 p-8">
            <Camera className="w-10 h-10 text-red-400 mb-3" />
            <p className="text-sm text-red-400 text-center mb-4">{error}</p>
            <button
              onClick={() => { stopCamera(); onClose(); }}
              className="px-6 py-2.5 rounded-full bg-white/10 text-white text-sm hover:bg-white/20"
            >
              Close
            </button>
          </div>
        )}
      </div>

      {/* Hidden file input for gallery upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Bottom controls */}
      {!starting && !error && (
        <div className="bg-gradient-to-t from-black/80 to-transparent p-6 pb-10">
          <p className="text-white/60 text-xs text-center mb-4">
            Snap a photo or upload from gallery
          </p>
          <div className="flex items-center justify-center gap-8">
            {/* Gallery upload button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={capturing}
              className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center hover:bg-white/25 active:scale-90 transition-all"
            >
              <ImagePlus className="w-5 h-5 text-white" />
            </button>

            {/* Capture button */}
            <button
              onClick={handleCapture}
              disabled={capturing}
              className="w-[72px] h-[72px] rounded-full border-4 border-white flex items-center justify-center active:scale-90 transition-transform"
            >
              <div className="w-[58px] h-[58px] rounded-full bg-white active:bg-white/80 transition-colors" />
            </button>

            {/* Spacer for symmetry */}
            <div className="w-12 h-12" />
          </div>
        </div>
      )}

      {/* Gallery upload fallback when camera fails */}
      {error && (
        <div className="bg-gradient-to-t from-black/80 to-transparent p-6 pb-10">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={capturing}
            className="w-full py-3 rounded-xl bg-white/15 text-white font-medium text-sm flex items-center justify-center gap-2 hover:bg-white/25 active:scale-[0.98] transition-all"
          >
            <ImagePlus className="w-4 h-4" />
            Upload from Gallery Instead
          </button>
        </div>
      )}
    </div>
  );
}
