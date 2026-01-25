import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function Landing() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col relative overflow-hidden">
      {/* Background Texture */}
      <div 
        className="absolute inset-0 z-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `url(/src/assets/bg-texture.png)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      
      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 text-center space-y-8 animate-in fade-in duration-1000">
        <div className="space-y-2">
          <div className="inline-block px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-bold tracking-widest uppercase mb-4">
            Performance Weight Management
          </div>
          <h1 className="text-7xl font-heading font-black italic tracking-tighter leading-none">
            PWM
          </h1>
          <p className="text-xl text-muted-foreground font-medium max-w-xs mx-auto">
            Weight is an entry requirement. <br />
            <span className="text-foreground">Performance is the goal.</span>
          </p>
        </div>

        <div className="space-y-4 w-full max-w-xs">
          <Button
            onClick={() => setLocation('/onboarding')}
            className="w-full h-14 text-lg font-bold uppercase tracking-wider bg-primary text-black hover:bg-primary/90 hover:scale-105 transition-transform"
          >
            Get Started <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </div>

      <div className="relative z-10 p-6 text-center">
        <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest">
          Version 1.0.0 • Prototype
        </p>
      </div>
    </div>
  );
}
