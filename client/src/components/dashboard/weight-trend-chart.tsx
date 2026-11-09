import { useState } from "react";
import { cn } from "@/lib/utils";
import { chartDayReadout, gapBridges, labelAbove, type WeightChart } from "@/lib/weight-chart";

const W = 320;
const H = 116;
const PAD_X = 16;
const PAD_TOP = 18;
const PAD_BOTTOM = 18;

/** One path through the numbers present, lifting the pen over gaps. */
function linePath(values: (number | null)[], x: (i: number) => number, y: (v: number) => number): string {
  let path = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v === null) { pen = false; return; }
    path += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
    pen = true;
  });
  return path;
}

/** What they weighed, what they should weigh, and the class. Tap a day to read it. */
export function WeightTrendChart({ chart, weightClass }: { chart: WeightChart; weightClass: number }) {
  const [selected, setSelected] = useState(chart.todayIndex);
  const { days, labels, min, max, showClass, todayIndex } = chart;
  const index = Math.min(selected, days.length - 1);

  const x = (i: number) => PAD_X + (i * (W - 2 * PAD_X)) / (days.length - 1);
  const y = (v: number) => PAD_TOP + ((max - v) / (max - min)) * (H - PAD_TOP - PAD_BOTTOM);
  const readout = chartDayReadout(days[index]);
  const today = days[todayIndex];

  return (
    <div className="mt-3">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`Morning weights and daily targets. ${readout}`}>
          {showClass && <line x1={PAD_X} x2={W - PAD_X} y1={y(weightClass)} y2={y(weightClass)} className="stroke-primary" strokeWidth={1.5} />}
          <path d={linePath(days.map(d => d.target), x, y)} fill="none" className="stroke-muted-foreground" strokeWidth={2} strokeDasharray="4 4" />
          {/* A thin line across missed mornings, with no dot, so nothing looks like a logged weight */}
          {gapBridges(days.map(d => d.weight)).map(([from, to]) => (
            <line
              key={from}
              x1={x(from)} y1={y(days[from].weight as number)}
              x2={x(to)} y2={y(days[to].weight as number)}
              className="stroke-foreground/30" strokeWidth={1.5}
            />
          ))}
          <path d={linePath(days.map(d => d.weight), x, y)} fill="none" className="stroke-foreground" strokeWidth={2.5} strokeLinejoin="round" />
          {days.map((d, i) => d.weight !== null && i !== todayIndex && (
            <circle key={i} cx={x(i)} cy={y(d.weight)} r={i === index ? 4 : 2.5} className="fill-foreground" />
          ))}
          {today.target !== null && <circle cx={x(todayIndex)} cy={y(today.target)} r={3} className="fill-muted-foreground" />}
          {index !== todayIndex && days[index].weight === null && days[index].target !== null && (
            <circle cx={x(index)} cy={y(days[index].target as number)} r={4} className="fill-muted-foreground" />
          )}
          {today.weight !== null && <circle cx={x(todayIndex)} cy={y(today.weight)} r={6} className="fill-primary stroke-card" strokeWidth={2} />}
          {labels.map(label => {
            const day = days[label.index];
            const other = label.series === 'weight' ? day.target : day.weight;
            const above = labelAbove(label, other, weightClass);
            const labelY = Math.min(H - 2, Math.max(12, y(label.value) + (above ? -9 : 17)));
            const anchor = label.index === 0 ? 'start' : label.index === days.length - 1 ? 'end' : 'middle';
            const labelX = x(label.index) + (day.isFuture && above ? 8 : 0);
            const isClass = label.series === 'target' && label.value === weightClass;
            return (
              <text
                key={`${label.series}-${label.index}`}
                x={labelX}
                y={labelY}
                textAnchor={anchor}
                fontSize={12}
                className={cn(
                  "tabular-nums",
                  label.series === 'weight' ? "fill-foreground font-semibold" : isClass ? "fill-primary font-semibold" : "fill-muted-foreground",
                )}
              >
                {label.series === 'weight' ? label.value.toFixed(1) : label.value}
              </text>
            );
          })}
        </svg>
        <div className="absolute inset-0 flex">
          {days.map((d, i) => (
            <button
              key={i}
              type="button"
              aria-label={chartDayReadout(d)}
              aria-pressed={i === index}
              onClick={() => setSelected(i)}
              className="h-full flex-1"
            />
          ))}
        </div>
      </div>

      <p className="mt-1 rounded-lg bg-muted/30 px-3 py-2 text-[13px] tabular-nums text-foreground/80">{readout}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-foreground" />Weighed</span>
        <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-muted-foreground" />Should weigh</span>
        {showClass
          ? <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-primary" />{weightClass} class</span>
          : <span>{weightClass} class is below this chart</span>}
      </div>
    </div>
  );
}
