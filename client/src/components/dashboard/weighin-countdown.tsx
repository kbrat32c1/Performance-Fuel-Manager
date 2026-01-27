import { useState, useEffect } from "react";
import { Clock } from "lucide-react";

interface WeighInCountdownProps {
  weighInDate: Date;
  simulatedDate: Date | null;
}

export function WeighInCountdown({ weighInDate, simulatedDate }: WeighInCountdownProps) {
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    const updateCountdown = () => {
      const now = simulatedDate || new Date();
      const weighIn = new Date(weighInDate);
      const diff = weighIn.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeLeft('WEIGH-IN TIME');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (hours < 48) {
        setTimeLeft(`${hours}h ${minutes}m until weigh-in`);
      } else {
        const days = Math.floor(hours / 24);
        setTimeLeft(`${days} days until weigh-in`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);
    return () => clearInterval(interval);
  }, [weighInDate, simulatedDate]);

  return (
    <div className="bg-orange-500/20 border border-orange-500/50 rounded-lg p-3 mb-4 text-center">
      <Clock className="w-5 h-5 text-orange-500 mx-auto mb-1" />
      <span className="text-orange-500 font-bold text-lg font-mono">{timeLeft}</span>
    </div>
  );
}
