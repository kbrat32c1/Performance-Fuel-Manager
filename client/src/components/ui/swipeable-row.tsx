import { useState, useCallback, useRef, useEffect } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticTap } from '@/lib/haptics';

export interface SwipeAction {
  icon: React.ReactNode;
  label: string;
  bgColor: string;     // Tailwind bg class e.g. 'bg-primary'
  textColor: string;   // Tailwind text class e.g. 'text-white'
  onClick: () => void;
}

interface SwipeableRowProps {
  children: React.ReactNode;
  actions: SwipeAction[];
  className?: string;
  disabled?: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const ACTION_WIDTH = 60; // px per action button

/**
 * A swipeable row component that reveals action buttons on swipe left.
 * iOS Mail-style — supports multiple actions (edit, move, delete, etc.)
 */
export function SwipeableRow({
  children,
  actions,
  className,
  disabled = false,
  isOpen: controlledOpen,
  onOpenChange,
}: SwipeableRowProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isHorizontal = useRef<boolean | null>(null);
  const hasMoved = useRef(false);
  const revealedRef = useRef(false);
  const dragging = useRef(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const firstActionRef = useRef<HTMLButtonElement>(null);

  const isOpen = controlledOpen ?? internalOpen;
  const setIsOpen = useCallback((open: boolean) => {
    setInternalOpen(open);
    onOpenChange?.(open);
  }, [onOpenChange]);

  const REVEAL_WIDTH = actions.length * ACTION_WIDTH;
  const THRESHOLD = REVEAL_WIDTH * 0.4; // 40% of reveal width to snap open

  // Follow open/closed changes made outside a drag (parent closing this row,
  // or the Actions button), so the visual position never disagrees with state.
  useEffect(() => {
    if (!dragging.current) setOffset(isOpen ? -REVEAL_WIDTH : 0);
  }, [isOpen, REVEAL_WIDTH]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isHorizontal.current = null;
    hasMoved.current = false;
    dragging.current = true;
    revealedRef.current = isOpen;
  }, [disabled, isOpen]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (disabled) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - touchStartX.current;
    const deltaY = currentY - touchStartY.current;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Direction lock after 8px
    if (isHorizontal.current === null && (absX > 8 || absY > 8)) {
      isHorizontal.current = absX > absY;
      if (!isHorizontal.current) return;
    }

    if (!isHorizontal.current) return;
    hasMoved.current = true;

    // Prevent vertical scrolling during horizontal swipe
    e.preventDefault();

    const baseOffset = revealedRef.current ? -REVEAL_WIDTH : 0;
    let newOffset = baseOffset + deltaX;

    // Clamp: slight rubber band right, max reveal left
    if (newOffset > 0) {
      newOffset = Math.sqrt(newOffset) * 3; // rubber band right
    } else if (newOffset < -REVEAL_WIDTH) {
      const over = -newOffset - REVEAL_WIDTH;
      newOffset = -REVEAL_WIDTH - Math.sqrt(over) * 3; // rubber band past reveal
    }

    setOffset(newOffset);
  }, [disabled, REVEAL_WIDTH]);

  const handleTouchEnd = useCallback(() => {
    dragging.current = false;
    if (disabled || !hasMoved.current) {
      isHorizontal.current = null;
      return;
    }

    if (offset < -THRESHOLD) {
      // Snap open
      setOffset(-REVEAL_WIDTH);
      if (!isOpen) hapticTap();
      setIsOpen(true);
    } else {
      // Snap closed
      setOffset(0);
      setIsOpen(false);
    }

    isHorizontal.current = null;
  }, [disabled, offset, THRESHOLD, REVEAL_WIDTH, isOpen, setIsOpen]);

  const handleClose = useCallback(() => {
    setOffset(0);
    setIsOpen(false);
  }, [setIsOpen]);

  // Mouse, trackpad, and keyboard path to the same actions
  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOpen) {
      handleClose();
    } else {
      setOffset(-REVEAL_WIDTH);
      setIsOpen(true);
      requestAnimationFrame(() => firstActionRef.current?.focus());
    }
  }, [isOpen, handleClose, REVEAL_WIDTH, setIsOpen]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && isOpen) {
      e.stopPropagation();
      handleClose();
      toggleRef.current?.focus();
    }
  }, [isOpen, handleClose]);

  const handleActionClick = useCallback((action: SwipeAction) => {
    setOffset(0);
    setIsOpen(false);
    action.onClick();
  }, [setIsOpen]);

  // Tap on row when open → close
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isOpen) {
      e.preventDefault();
      e.stopPropagation();
      handleClose();
    }
  }, [isOpen, handleClose]);

  const transition = isHorizontal.current !== null && hasMoved.current
    ? 'none'
    : 'transform 250ms cubic-bezier(0.25, 0.1, 0.25, 1.05)';

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      role="group"
      aria-label="Swipeable item"
      onKeyDown={handleKeyDown}
    >
      {/* Action buttons revealed behind the row */}
      <div
        className="absolute inset-y-0 right-0 flex items-stretch"
        style={{ width: REVEAL_WIDTH }}
        aria-hidden={!isOpen}
      >
        {actions.map((action, i) => (
          <button
            key={i}
            ref={i === 0 ? firstActionRef : undefined}
            type="button"
            onClick={() => handleActionClick(action)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 transition-colors active:brightness-90",
              action.bgColor,
              action.textColor,
            )}
            style={{ width: ACTION_WIDTH }}
            aria-label={action.label}
            tabIndex={isOpen ? 0 : -1}
          >
            {action.icon}
            <span className="text-[9px] font-bold">{action.label}</span>
          </button>
        ))}
      </div>

      {/* Main content — slides with swipe */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
        className="relative flex items-stretch bg-background"
        style={{
          transform: `translateX(${offset}px)`,
          transition,
        }}
      >
        <div className="min-w-0 flex-1">{children}</div>
        {!disabled && actions.length > 0 && (
          <button
            ref={toggleRef}
            type="button"
            onClick={handleToggle}
            aria-label={isOpen ? 'Hide actions' : `Actions: ${actions.map(a => a.label).join(', ')}`}
            aria-expanded={isOpen}
            className="sr-only focus-visible:not-sr-only focus-visible:flex focus-visible:w-7 pointer-fine:not-sr-only pointer-fine:flex pointer-fine:w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/30 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <MoreHorizontal className="w-4 h-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
