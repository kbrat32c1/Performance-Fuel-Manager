import { Info } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

interface HelpTipProps {
  title: string;
  description: string;
  className?: string;
}

export function HelpTip({ title, description, className }: HelpTipProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`inline-flex items-center justify-center w-3 h-3 ml-0.5 align-middle opacity-40 hover:opacity-80 transition-opacity ${className || ''}`}
          aria-label={`Help: ${title}`}
        >
          <Info className="w-2.5 h-2.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        className="w-56 p-3"
      >
        <p className="text-xs font-bold mb-1">{title}</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed">{description}</p>
      </PopoverContent>
    </Popover>
  );
}
