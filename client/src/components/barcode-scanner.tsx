import { useState, useEffect, useRef, useCallback } from "react";
import { X, Camera, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
}

export function BarcodeScanner({ open, onClose, onScan }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [useNative, setUseNative] = useState(false);
  const scannedRef = useRef(false);

  const stopCamera = useCallback(() => {
    if (scannerRef.current) {
      try {
        scannerRef.current.stop();
      } catch {}
      scannerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const handleScan = useCallback((code: string) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    stopCamera();
    onScan(code);
  }, [onScan, stopCamera]);

  useEffect(() => {
    if (!open) {
      stopCamera();
      scannedRef.current = false;
      setUseNative(false);
      setError(null);
      setStarting(true);
      return;
    }

    let cancelled = false;

    async function startScanning() {
      setStarting(true);
      setError(null);

      // Try native BarcodeDetector first (Chrome Android, Safari 17+)
      if ('BarcodeDetector' in window) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
          });
          if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
          }
          setUseNative(true);
          setStarting(false);

          // @ts-ignore - BarcodeDetector is not in all TS libs yet
          const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'] });

          const scan = async () => {
            if (cancelled || scannedRef.current || !videoRef.current) return;
            try {
              const barcodes = await detector.detect(videoRef.current);
              if (barcodes.length > 0 && barcodes[0].rawValue) {
                handleScan(barcodes[0].rawValue);
                return;
              }
            } catch {}
            if (!cancelled && !scannedRef.current) {
              requestAnimationFrame(scan);
            }
          };
          requestAnimationFrame(scan);
          return;
        } catch (e: any) {
          // Clean up any started stream before falling through
          setUseNative(false);
          stopCamera();
          console.log('Native BarcodeDetector failed, trying html5-qrcode:', e.message);
        }
      }

      // Fallback: html5-qrcode
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;

        const scannerId = 'barcode-scanner-region';
        const scanner = new Html5Qrcode(scannerId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 280, height: 150 },
            aspectRatio: 1.777,
          },
          (decodedText: string) => {
            if (!cancelled) handleScan(decodedText);
          },
          () => {} // ignore scan failures
        );
        if (cancelled) { scanner.stop().catch(() => {}); return; }
        setStarting(false);
      } catch (e: any) {
        if (!cancelled) {
          console.error('Barcode scanner error:', e);
          stopCamera();
          // Provide helpful error messages for common issues
          let msg = e.message || 'Camera access denied. Please allow camera access and try again.';
          if (msg.includes('MIME') || msg.includes('text/html')) {
            msg = 'Scanner failed to load. Please close and try again, or clear the app cache in your browser settings.';
          }
          setError(msg);
          setStarting(false);
        }
      }
    }

    startScanning();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, handleScan, stopCamera]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      {/* Header — with safe-area padding for iOS notch */}
      <div className="flex items-center justify-between p-4 z-10 bg-gradient-to-b from-black/80 to-transparent" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-2 text-white">
          <Camera className="w-5 h-5" />
          <span className="text-sm font-medium">Scan Barcode</span>
        </div>
        <button
          onClick={() => { stopCamera(); onClose(); }}
          className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 active:scale-95 transition-all"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Camera viewfinder — full screen */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-black">
        {/* Native BarcodeDetector uses this video element */}
        <video
          ref={videoRef}
          className={cn(
            "w-full h-full object-cover",
            !useNative && !starting && "hidden"
          )}
          playsInline
          muted
          autoPlay
        />
        {/* html5-qrcode renders its own video into this div */}
        <div
          id="barcode-scanner-region"
          className={cn(
            "absolute inset-0 overflow-hidden",
            useNative && "hidden"
          )}
        />

        {/* Scan target overlay */}
        {!starting && !error && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {/* Target box */}
            <div className="relative w-72 h-40">
              {/* Corners */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-emerald-400 rounded-tl" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-emerald-400 rounded-tr" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-emerald-400 rounded-bl" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-emerald-400 rounded-br" />
              {/* Scanning line animation */}
              <div className="absolute left-2 right-2 h-0.5 bg-emerald-400/80 animate-pulse" style={{ top: '50%' }} />
            </div>
          </div>
        )}

        {/* Loading state */}
        {starting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mb-2" />
            <span className="text-sm text-white/80">Starting camera...</span>
          </div>
        )}

        {/* Error state */}
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

      {/* Instructions */}
      {!starting && !error && (
        <div className="bg-gradient-to-t from-black/80 to-transparent p-6" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
          <p className="text-white/60 text-sm text-center">
            Point camera at a barcode on any food package
          </p>
        </div>
      )}
    </div>
  );
}
