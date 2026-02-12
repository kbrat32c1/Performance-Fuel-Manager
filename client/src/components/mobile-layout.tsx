import React, { useEffect, useRef } from 'react';
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { useStore } from "@/lib/store";
import { QuickLogFAB } from "@/components/quick-log-fab";
import { AddFoodSheet } from "@/components/add-food-sheet";
import { CompetitionBanner, useCompetitionActive } from "@/components/competition-banner";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { KeyboardShortcutsHelp } from "@/components/keyboard-shortcuts-help";

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

  // Hide Week tab for non-competition protocols (4=Gain, 5=SPAR General)
  const protocol = profile?.protocol || '5';
  const isCompetitionProtocol = protocol !== '4' && protocol !== '5';

  // Enable keyboard shortcuts for navigation
  useKeyboardShortcuts({ enabled: showNav });

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
      {/* Skip links for screen readers */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:bg-primary focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-medium">
        Skip to main content
      </a>
      {showNav && (
        <a href="#main-nav" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:bg-primary focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-medium">
          Skip to navigation
        </a>
      )}
      <div className={cn("w-full max-w-md flex-1 flex flex-col relative", className)}>
        {/* Safe Area Top Padding */}
        <div className="h-safe-top w-full" />

        {/* Competition Banner — sticky at top when timer is active */}
        {showNav && <CompetitionBanner />}

        {/* Main Content */}
        <main id="main-content" ref={mainRef} className="flex-1 w-full p-4 pb-32 animate-in fade-in duration-500">
          {children}
        </main>

        {/* Bottom Nav */}
        {showNav && (
          <nav id="main-nav" className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-lg border-t border-border flex justify-around items-end min-h-[64px] pb-safe-bottom max-w-md mx-auto overflow-visible" aria-label="Main navigation">
            <NavItem
              icon="LayoutDashboard"
              label="Today"
              active={location === '/dashboard'}
              onClick={() => setLocation('/dashboard')}
            />
            {isCompetitionProtocol ? (
              <NavItem
                icon="Calendar"
                label="Week"
                active={location === '/weekly'}
                onClick={() => setLocation('/weekly')}
              />
            ) : (
              <NavItem
                icon="BarChart3"
                label="Reports"
                active={location === '/reports'}
                onClick={() => setLocation('/reports')}
              />
            )}
            {/* Center Log button — raised above nav */}
            <div className="relative flex items-end justify-center" style={{ marginTop: '-20px' }}>
              <QuickLogFAB />
            </div>
            <NavItem
              icon="Utensils"
              label="Food"
              active={location === '/food'}
              onClick={() => setLocation('/food')}
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
        {showNav && <KeyboardShortcutsHelp />}
        {showNav && <AddFoodSheet />}
      </div>
    </div>
  );
}

import { LayoutDashboard, Activity, Calendar, Settings, History, Utensils, BarChart3 } from "lucide-react";

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
  const Icon = { LayoutDashboard, Activity, Calendar, Settings, History, Utensils, BarChart3 }[icon as string] || Settings;

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
      aria-label={`${label}${badge ? ', competition active' : ''}`}
      aria-current={active ? "page" : undefined}
    >
      <div className={cn(
        // Larger touch target for the icon area
        "relative p-2.5 rounded-full transition-all",
        primary ? "bg-primary text-white shadow-[0_0_20px_rgba(232,80,30,0.4)] scale-125" : "",
        highlighted && !active && "bg-cyan-500/10"
      )}>
        <Icon size={primary ? 24 : 22} strokeWidth={primary ? 2.5 : 2} aria-hidden="true" />
        {/* Pulsing competition badge */}
        {badge && (
          <span className="absolute top-1 right-1 flex h-2.5 w-2.5" aria-hidden="true">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
        )}
      </div>
      {!primary && <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>}
    </button>
  );
}
