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
      const timer = setTimeout(onDismiss, 4000);
      return () => clearTimeout(timer);
    }
  }, [show, onDismiss]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -80, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -80, opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
          className="fixed top-4 left-4 right-4 z-[99] mx-auto max-w-md"
          onClick={onDismiss}
        >
          <div className="bg-card border border-primary/30 rounded-xl shadow-lg shadow-primary/10 px-4 py-3 flex items-center gap-3">
            <span className="text-2xl">{emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground">{title}</p>
              {subtitle && (
                <p className="text-[11px] text-muted-foreground">{subtitle}</p>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
