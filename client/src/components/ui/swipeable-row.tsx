import { useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Trash2 } from 'lucide-react';

interface SwipeableRowProps {
  children: React.ReactNode;
  onDelete: () => void;
  className?: string;
  disabled?: boolean;
}

/**
 * A swipeable row component that reveals a delete action on swipe left.
 * Used for mobile-friendly deletion of weight logs.
 */
export function SwipeableRow({ children, onDelete, className, disabled = false }: SwipeableRowProps) {
  const [offset, setOffset] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isHorizontal = useRef<boolean | null>(null);
  const DELETE_THRESHOLD = 80;
  const OPEN_OFFSET = -80;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isHorizontal.current = null;
  }, [disabled]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (disabled) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - touchStartX.current;
    const deltaY = currentY - touchStartY.current;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Determine direction if not yet set
    if (isHorizontal.current === null && (absX > 10 || absY > 10)) {
      isHorizontal.current = absX > absY;
    }

    // Only handle horizontal swipes
    if (!isHorizontal.current) return;

    // Prevent vertical scrolling during horizontal swipe
    e.preventDefault();

    // Calculate new offset
    const baseOffset = isOpen ? OPEN_OFFSET : 0;
    let newOffset = baseOffset + deltaX;

    // Clamp offset: max 20px right, min -100px left
    newOffset = Math.max(-100, Math.min(20, newOffset));

    // Apply resistance when pulling past the delete threshold
    if (newOffset < OPEN_OFFSET) {
      const overPull = OPEN_OFFSET - newOffset;
      newOffset = OPEN_OFFSET - Math.sqrt(overPull) * 5;
    }
    if (newOffset > 0) {
      newOffset = Math.sqrt(newOffset) * 3;
    }

    setOffset(newOffset);
  }, [disabled, isOpen]);

  const handleTouchEnd = useCallback(() => {
    if (disabled) return;

    // If swiped past threshold, keep open
    if (offset < -DELETE_THRESHOLD / 2) {
      setOffset(OPEN_OFFSET);
      setIsOpen(true);
    } else {
      setOffset(0);
      setIsOpen(false);
    }

    isHorizontal.current = null;
  }, [disabled, offset]);

  const handleClose = useCallback(() => {
    setOffset(0);
    setIsOpen(false);
  }, []);

  const handleDelete = useCallback(() => {
    onDelete();
    setOffset(0);
    setIsOpen(false);
  }, [onDelete]);

  // Close when clicking outside on desktop
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isOpen) {
      e.preventDefault();
      handleClose();
    }
  }, [isOpen, handleClose]);

  return (
    <div
      className={cn("relative overflow-hidden rounded-lg", className)}
      role="group"
      aria-label="Swipeable item with delete action"
    >
      {/* Delete background revealed on swipe */}
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-end bg-destructive"
        style={{ width: Math.abs(Math.min(offset, 0)) + 80 }}
        aria-hidden={!isOpen}
      >
        <button
          onClick={handleDelete}
          className="h-full px-6 flex items-center justify-center text-destructive-foreground hover:bg-destructive/90 transition-colors"
          aria-label="Delete this item"
          tabIndex={isOpen ? 0 : -1}
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      {/* Main content - moves with swipe */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
        className="relative bg-card transition-transform duration-200 ease-out"
        style={{
          transform: `translateX(${offset}px)`,
          transition: isHorizontal.current === null ? 'transform 0.2s ease-out' : 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}
