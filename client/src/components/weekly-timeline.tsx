import { cn } from "@/lib/utils";

export function WeeklyTimeline({ currentDay }: { currentDay: number }) {
  const days = [
    { name: "Mon", id: 1, label: "Load" },
    { name: "Tue", id: 2, label: "Load" },
    { name: "Wed", id: 3, label: "Check" },
    { name: "Thu", id: 4, label: "Cut" },
    { name: "Fri", id: 5, label: "Prep" },
    { name: "Sat", id: 6, label: "Race" },
    { name: "Sun", id: 0, label: "Rest" },
  ];

  return (
    <div className="w-full overflow-x-auto pb-2">
      <div className="flex justify-between min-w-[320px] gap-1">
        {days.map((day) => {
          const isActive = day.id === currentDay;
          const isPast = (currentDay > day.id && day.id !== 0) || (currentDay === 0 && day.id !== 0); // Simplified past logic for Mon-Sun week
          
          return (
            <div 
              key={day.id} 
              className={cn(
                "flex-1 flex flex-col items-center p-2 rounded-lg border transition-all",
                isActive ? "bg-primary text-black border-primary scale-105 shadow-lg z-10" : 
                isPast ? "bg-muted/20 border-muted text-muted-foreground" : 
                "bg-card border-muted text-foreground"
              )}
            >
              <span className="text-[10px] uppercase font-bold tracking-wider opacity-80">{day.name}</span>
              <span className={cn("text-[9px] font-mono mt-0.5", isActive ? "text-black/70" : "text-muted-foreground")}>{day.label}</span>
              {isActive && <div className="w-1 h-1 bg-black rounded-full mt-1" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
