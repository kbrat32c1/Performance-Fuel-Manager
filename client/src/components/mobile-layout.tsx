import React from 'react';
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { useStore } from "@/lib/store";
import { getDay } from "date-fns";

interface MobileLayoutProps {
  children: React.ReactNode;
  className?: string;
  showNav?: boolean;
}

export function MobileLayout({ children, className, showNav = true }: MobileLayoutProps) {
  const [location, setLocation] = useLocation();
  const { profile } = useStore();

  // Determine if Recovery tab should be highlighted/shown prominently
  const today = profile.simulatedDate || new Date();
  const dayOfWeek = getDay(today);
  // Show Recovery more prominently on Friday (5), Saturday (6), and Sunday (0)
  const isRecoveryRelevant = dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0;

  return (
    <div className="min-h-screen w-full bg-background text-foreground overflow-hidden flex flex-col items-center justify-start relative">
      <div className={cn("w-full max-w-md flex-1 flex flex-col relative", className)}>
        {/* Safe Area Top Padding */}
        <div className="h-safe-top w-full" />

        {/* Main Content */}
        <main className="flex-1 w-full p-4 pb-24 animate-in fade-in duration-500">
          {children}
        </main>

        {/* Bottom Nav */}
        {showNav && (
          <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-t border-border flex justify-around items-center h-16 pb-safe-bottom max-w-md mx-auto">
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
            />
          </nav>
        )}
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
}

function NavItem({ icon, label, active, onClick, primary, highlighted }: NavItemProps) {
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
        "p-2.5 rounded-full transition-all",
        primary ? "bg-primary text-black shadow-[0_0_20px_rgba(132,204,22,0.4)] scale-125" : "",
        highlighted && !active && "bg-cyan-500/10"
      )}>
        <Icon size={primary ? 24 : 22} strokeWidth={primary ? 2.5 : 2} />
      </div>
      {!primary && <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>}
    </button>
  );
}
