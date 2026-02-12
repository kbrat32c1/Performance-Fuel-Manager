import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ConfettiPiece {
  id: number;
  x: number;
  color: string;
  delay: number;
  rotation: number;
  size: number;
}

const COLORS = [
  "#22c55e", // green
  "#eab308", // yellow
  "#3b82f6", // blue
  "#f97316", // orange
  "#ec4899", // pink
  "#a855f7", // purple
  "#14b8a6", // teal
  "#ef4444", // red
];

function generatePieces(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100, // percentage across screen
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    delay: Math.random() * 0.6,
    rotation: Math.random() * 360,
    size: 4 + Math.random() * 6,
  }));
}

interface ConfettiProps {
  active: boolean;
  duration?: number;
  pieces?: number;
  onComplete?: () => void;
}

export function Confetti({ active, duration = 2500, pieces = 40, onComplete }: ConfettiProps) {
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([]);

  useEffect(() => {
    if (active) {
      setConfetti(generatePieces(pieces));
      const timer = setTimeout(() => {
        setConfetti([]);
        onComplete?.();
      }, duration);
      return () => clearTimeout(timer);
    } else {
      setConfetti([]);
    }
  }, [active, duration, pieces, onComplete]);

  return (
    <AnimatePresence>
      {confetti.length > 0 && (
        <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
          {confetti.map((piece) => (
            <motion.div
              key={piece.id}
              initial={{
                x: `${piece.x}vw`,
                y: -20,
                rotate: 0,
                opacity: 1,
                scale: 1,
              }}
              animate={{
                y: "110vh",
                rotate: piece.rotation + 720,
                opacity: [1, 1, 0.8, 0],
                scale: [1, 1.2, 0.8],
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 2 + Math.random(),
                delay: piece.delay,
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
              style={{
                position: "absolute",
                width: piece.size,
                height: piece.size * 1.4,
                backgroundColor: piece.color,
                borderRadius: piece.size > 7 ? "50% 0" : "2px",
              }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}

// Celebration banner that slides in from top
interface CelebrationBannerProps {
  show: boolean;
  emoji: string;
  title: string;
  subtitle?: string;
  onDismiss: () => void;
}

export function CelebrationBanner({ show, emoji, title, subtitle, onDismiss }: CelebrationBannerProps) {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(onDismiss, 8000);
      return () => clearTimeout(timer);
    }
  }, [show, onDismiss]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -100, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -100, opacity: 0, scale: 0.9 }}
          transition={{ type: "spring", damping: 18, stiffness: 250 }}
          className="fixed top-0 left-0 right-0 z-[99]"
          onClick={onDismiss}
        >
          {/* Full-width banner with safe area padding */}
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-5 pt-[max(env(safe-area-inset-top),16px)] pb-4 shadow-xl shadow-green-900/30">
            <div className="flex items-center gap-3 max-w-md mx-auto">
              <span className="text-3xl">{emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-black text-white tracking-wide">{title}</p>
                {subtitle && (
                  <p className="text-xs text-white/80 font-medium">{subtitle}</p>
                )}
              </div>
              <span className="text-white/50 text-xs">tap to dismiss</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
