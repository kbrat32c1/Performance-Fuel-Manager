import { MobileLayout } from "@/components/mobile-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, Clock, Droplets, Utensils } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

export default function Recovery() {
  const [elapsed, setElapsed] = useState(0);
  const [active, setActive] = useState(false);

  useEffect(() => {
    let interval: any;
    if (active) {
      interval = setInterval(() => {
        setElapsed(e => e + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [active]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <MobileLayout>
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-heading font-black italic uppercase text-primary">Recovery Mode</h1>
          <p className="text-muted-foreground">Post Weigh-In Protocol</p>
        </div>

        {/* Timer Card */}
        <Card className="bg-muted/10 border-primary/20 overflow-hidden relative">
          <div className="absolute inset-0 bg-primary/5 animate-pulse" />
          <CardContent className="p-8 text-center relative z-10">
            <div className="text-6xl font-mono font-bold tracking-tighter mb-4">
              {formatTime(elapsed)}
            </div>
            {!active ? (
              <Button onClick={() => setActive(true)} className="bg-primary text-black font-bold uppercase w-full">
                Start Timer (I just weighed in)
              </Button>
            ) : (
              <Button onClick={() => { setActive(false); setElapsed(0); }} variant="outline" className="uppercase w-full border-destructive text-destructive hover:bg-destructive/10">
                Stop / Reset
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Phase Timeline */}
        <div className="space-y-4">
          <PhaseCard 
            phase="0-15 Min" 
            title="Immediate Hydration" 
            active={elapsed < 900} 
            completed={elapsed > 900}
            items={[
              { icon: Droplets, text: "Sip 16-24oz Water + Electrolytes" },
              { icon: Clock, text: "Do not gulp. Small sips." }
            ]}
          />
          <PhaseCard 
            phase="15-30 Min" 
            title="Gut Activation" 
            active={elapsed >= 900 && elapsed < 1800}
            completed={elapsed > 1800}
            items={[
              { icon: Utensils, text: "Simple Carbs (Fruit, Honey, Gel)" },
              { icon: Clock, text: "Easy to digest foods only." }
            ]}
          />
          <PhaseCard 
            phase="30-60 Min" 
            title="Refuel" 
            active={elapsed >= 1800 && elapsed < 3600}
            completed={elapsed > 3600}
            items={[
              { icon: Utensils, text: "Complex Meal (Carbs + Protein)" },
              { icon: Droplets, text: "Continue hydration to thirst." }
            ]}
          />
        </div>
      </div>
    </MobileLayout>
  );
}

function PhaseCard({ phase, title, items, active, completed }: any) {
  return (
    <div className={cn(
      "border rounded-lg p-4 transition-all duration-300",
      active ? "bg-primary/5 border-primary shadow-[0_0_15px_rgba(132,204,22,0.1)] scale-102" : "bg-card border-muted opacity-50",
      completed && "opacity-30"
    )}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <span className={cn("text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded", active ? "bg-primary text-black" : "bg-muted text-muted-foreground")}>
            {phase}
          </span>
          <h3 className="font-heading font-bold text-xl mt-2">{title}</h3>
        </div>
        {completed && <Check className="text-primary w-6 h-6" />}
      </div>
      
      <div className="space-y-2">
        {items.map((item: any, i: number) => (
          <div key={i} className="flex items-center gap-3 text-sm">
            <item.icon className="w-4 h-4 text-primary" />
            <span>{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
