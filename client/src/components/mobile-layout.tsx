import React, { useEffect, useRef } from 'react';
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { useStore } from "@/lib/store";
import { QuickLogFAB } from "@/components/quick-log-fab";
import { CompetitionBanner, useCompetitionActive } from "@/components/competition-banner";

interface MobileLayoutProps {
  children: React.ReactNode;
  className?: string;
  showNav?: boolean;
}

export function MobileLayout({ children, className, showNav = true }: MobileLayoutProps) {
  const [location, setLocation] = useLocation();
  const { profile, getDaysUntilWeighIn } = useStore();
  const mainRef = useRef<HTMLElement>(null);
  const compState = useCompetitionActive();

  // Scroll to top on route change
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, [location]);

  // Determine if Recovery tab should be highlighted/shown prominently
  const daysUntilWeighIn = getDaysUntilWeighIn();
  // Show Recovery more prominently 1 day before, on competition day, and day after
  const isRecoveryRelevant = daysUntilWeighIn >= -1 && daysUntilWeighIn <= 1;

  return (
    <div className="min-h-screen w-full bg-background text-foreground overflow-hidden flex flex-col items-center justify-start relative">
      <div className={cn("w-full max-w-md flex-1 flex flex-col relative", className)}>
        {/* Safe Area Top Padding */}
        <div className="h-safe-top w-full" />

        {/* Competition Banner — sticky at top when timer is active */}
        {showNav && <CompetitionBanner />}

        {/* Main Content */}
        <main ref={mainRef} className="flex-1 w-full p-4 pb-32 animate-in fade-in duration-500">
          {children}
        </main>

        {/* Bottom Nav */}
        {showNav && (
          <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-lg border-t border-border flex justify-around items-center min-h-[64px] pb-safe-bottom max-w-md mx-auto">
            <NavItem
              icon="LayoutDashboard"
              label="Today"
              active={location === '/dashboard'}
              onClick={() => setLocation('/dashboard')}
            />
            <NavItem
              icon="Calendar"
              label="Week"
              active={location === '/weekly'}
              onClick={() => setLocation('/weekly')}
            />
            <NavItem
              icon="History"
              label="History"
              active={location === '/history'}
              onClick={() => setLocation('/history')}
            />
            <NavItem
              icon="Activity"
              label="Recovery"
              active={location === '/recovery'}
              onClick={() => setLocation('/recovery')}
              highlighted={isRecoveryRelevant}
              badge={compState.active}
            />
          </nav>
        )}
        {showNav && <QuickLogFAB />}
      </div>
    </div>
  );
}

import { LayoutDashboard, Activity, Calendar, Settings, History } from "lucide-react";

interface NavItemProps {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
  primary?: boolean;
  highlighted?: boolean;
  badge?: boolean;
}

function NavItem({ icon, label, active, onClick, primary, highlighted, badge }: NavItemProps) {
  const Icon = { LayoutDashboard, Activity, Calendar, Settings, History }[icon as string] || Settings;

  return (
    <button
      onClick={onClick}
      className={cn(
        // Increased touch target to 44px minimum
        "flex flex-col items-center justify-center gap-1 min-w-[56px] min-h-[48px] h-full transition-all duration-200",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
        primary && "text-primary -mt-8",
        highlighted && !active && "text-cyan-500"
      )}
    >
      <div className={cn(
        // Larger touch target for the icon area
        "relative p-2.5 rounded-full transition-all",
        primary ? "bg-primary text-white shadow-[0_0_20px_rgba(232,80,30,0.4)] scale-125" : "",
        highlighted && !active && "bg-cyan-500/10"
      )}>
        <Icon size={primary ? 24 : 22} strokeWidth={primary ? 2.5 : 2} />
        {/* Pulsing competition badge */}
        {badge && (
          <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
        )}
      </div>
      {!primary && <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>}
    </button>
  );
}
