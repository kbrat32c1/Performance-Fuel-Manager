/**
 * Dashboard-specific skeleton loaders for loading states.
 * These provide visual feedback while data is being fetched.
 */

import { Skeleton } from './skeleton';
import { Card, CardContent } from './card';
import { cn } from '@/lib/utils';

/**
 * Skeleton for the weight card / quick weigh-in section.
 */
export function WeightCardSkeleton() {
  return (
    <Card className="border-muted">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <div className="flex items-center justify-center gap-4 py-4">
          <Skeleton className="h-16 w-24" />
          <div className="space-y-2 text-center">
            <Skeleton className="h-3 w-20 mx-auto" />
            <Skeleton className="h-3 w-16 mx-auto" />
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 flex-1 rounded-lg" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Skeleton for the hydration tracker card.
 */
export function HydrationSkeleton() {
  return (
    <Card className="border-muted">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-5 w-12" />
            <Skeleton className="h-4 w-16 rounded" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="h-2 w-full rounded-full mb-2" />
        <Skeleton className="h-3 w-48 mb-2" />
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-11 w-14 rounded-lg" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Skeleton for the SPAR nutrition tracker.
 */
export function SparTrackerSkeleton() {
  return (
    <Card className="border-muted">
      <CardContent className="p-3 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>

        {/* Progress rings */}
        <div className="flex items-center justify-center gap-3 py-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col items-center gap-0.5">
              <Skeleton className="h-11 w-11 rounded-full" />
              <Skeleton className="h-3 w-8" />
            </div>
          ))}
        </div>

        {/* Quick adjust buttons */}
        <div className="grid grid-cols-3 gap-1.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col items-center rounded-lg border border-muted p-2">
              <div className="flex items-center gap-1 mb-1">
                <Skeleton className="h-3 w-3" />
                <Skeleton className="h-3 w-10" />
              </div>
              <div className="flex items-center gap-1.5">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <Skeleton className="h-10 w-10 rounded-lg" />
              </div>
            </div>
          ))}
        </div>

        {/* Category tabs */}
        <div className="flex gap-1.5">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-9 flex-1 rounded-lg" />
          ))}
        </div>

        {/* Food list */}
        <div className="space-y-1.5">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-11 w-full rounded-lg" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Skeleton for the macro tracker card.
 */
export function MacroTrackerSkeleton() {
  return (
    <Card className="border-muted">
      <CardContent className="p-3 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>

        {/* Macro progress bars */}
        <div className="space-y-3">
          {['Protein', 'Carbs', 'Fiber'].map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ))}
        </div>

        {/* Food log */}
        <div className="space-y-1.5 pt-2 border-t border-muted">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Skeleton for a generic card with title and content.
 */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("border-muted", className)}>
      <CardContent className="p-4">
        <Skeleton className="h-4 w-24 mb-3" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-3/4" />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Skeleton for the history page weight log list.
 */
export function WeightLogListSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3 p-3 bg-card rounded-lg border border-muted">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </div>
  );
}

/**
 * Full dashboard skeleton layout for initial load.
 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="space-y-1">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>

      {/* Weight card */}
      <WeightCardSkeleton />

      {/* Hydration */}
      <HydrationSkeleton />

      {/* Nutrition */}
      <SparTrackerSkeleton />
    </div>
  );
}
