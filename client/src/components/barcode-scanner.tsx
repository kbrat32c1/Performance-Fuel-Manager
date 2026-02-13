import { useState, useEffect, useRef, useCallback } from "react";
import { X, Camera, Loader2, CheckCircle2 } from "lucide-react";
import { hapticTap, hapticSuccess } from "@/lib/haptics";

interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
}

export function BarcodeScanner({ open, onClose, onScan }: BarcodeScannerProps) {
  const scannerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [found, setFound] = useState(false);
  const scannedRef = useRef(false);

  const stopScanner = useCallback(() => {
    if (scannerRef.current) {
      try {
        scannerRef.current.stop();
      } catch {}
      scannerRef.current = null;
    }
  }, []);

  const handleScan = useCallback((code: string) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    hapticSuccess();
    setFound(true);
    // Brief "Found!" flash before closing
    setTimeout(() => {
      stopScanner();
      onScan(code);
    }, 400);
  }, [onScan, stopScanner]);

  useEffect(() => {
    if (!open) {
      stopScanner();
      scannedRef.current = false;
      setError(null);
      setStarting(true);
      setFound(false);
      return;
    }

    let cancelled = false;

    async function startScanning() {
      setStarting(true);
      setError(null);
      setFound(false);

      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;

        // Small delay to ensure the DOM element is mounted
        await new Promise(r => setTimeout(r, 100));
        if (cancelled) return;

        const el = document.getElementById('barcode-scanner-region');
        if (!el) {
          setError('Scanner container not found. Please close and try again.');
          setStarting(false);
          return;
        }

        const scanner = new Html5Qrcode('barcode-scanner-region');
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 15,
            qrbox: { width: 300, height: 160 },
            aspectRatio: 1.777,
            disableFlip: false,
          },
          (decodedText: string) => {
            if (!cancelled) handleScan(decodedText);
          },
          () => {} // ignore scan failures
        );

        if (cancelled) {
          scanner.stop().catch(() => {});
          return;
        }
        setStarting(false);
        hapticTap();
      } catch (e: any) {
        if (!cancelled) {
          console.error('Barcode scanner error:', e);
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
      stopScanner();
    };
  }, [open, handleScan, stopScanner]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 z-10 bg-gradient-to-b from-black/80 to-transparent" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-2 text-white">
          <Camera className="w-5 h-5" />
          <span className="text-sm font-medium">Scan Barcode</span>
        </div>
        <button
          onClick={() => { stopScanner(); onClose(); }}
          className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 active:scale-95 transition-all"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Camera viewfinder */}
      <div className="flex-1 relative overflow-hidden bg-black">
        <div
          id="barcode-scanner-region"
          className="w-full h-full"
        />

        {/* Scan target overlay */}
        {!starting && !error && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="relative w-80 h-44">
              {/* Corner brackets */}
              <div className={`absolute top-0 left-0 w-10 h-10 border-t-[3px] border-l-[3px] rounded-tl-lg transition-colors duration-200 ${found ? 'border-green-400' : 'border-emerald-400'}`} />
              <div className={`absolute top-0 right-0 w-10 h-10 border-t-[3px] border-r-[3px] rounded-tr-lg transition-colors duration-200 ${found ? 'border-green-400' : 'border-emerald-400'}`} />
              <div className={`absolute bottom-0 left-0 w-10 h-10 border-b-[3px] border-l-[3px] rounded-bl-lg transition-colors duration-200 ${found ? 'border-green-400' : 'border-emerald-400'}`} />
              <div className={`absolute bottom-0 right-0 w-10 h-10 border-b-[3px] border-r-[3px] rounded-br-lg transition-colors duration-200 ${found ? 'border-green-400' : 'border-emerald-400'}`} />

              {/* Animated scanning laser line */}
              {!found && (
                <div
                  className="absolute left-3 right-3 h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent"
                  style={{
                    animation: 'scanline 2s ease-in-out infinite',
                  }}
                />
              )}

              {/* Found checkmark */}
              {found && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center animate-in zoom-in duration-200">
                    <CheckCircle2 className="w-10 h-10 text-green-400" />
                  </div>
                </div>
              )}
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
              onClick={() => { stopScanner(); onClose(); }}
              className="px-6 py-2.5 rounded-full bg-white/10 text-white text-sm hover:bg-white/20"
            >
              Close
            </button>
          </div>
        )}
      </div>

      {/* Bottom instructions / status */}
      {!starting && !error && (
        <div className="bg-gradient-to-t from-black/80 to-transparent p-6" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
          {found ? (
            <p className="text-green-400 text-sm text-center font-medium">
              ✓ Barcode found! Looking up product...
            </p>
          ) : (
            <div className="text-center">
              <p className="text-white/70 text-sm">
                Align barcode within the frame
              </p>
              <p className="text-white/40 text-xs mt-1">
                Hold steady · Works best in good lighting
              </p>
            </div>
          )}
        </div>
      )}

      {/* CSS animation for the scanning laser */}
      <style>{`
        @keyframes scanline {
          0%, 100% { top: 15%; opacity: 0.4; }
          50% { top: 80%; opacity: 1; }
        }
      `}</style>
    </div>
  );
}
