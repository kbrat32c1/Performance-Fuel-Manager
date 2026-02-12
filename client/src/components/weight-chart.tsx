import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from 'recharts';
import { useStore } from '@/lib/store';
import { format, subDays, addDays, differenceInDays, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity } from 'lucide-react';

export function WeightChart() {
  const { logs, profile } = useStore();
  
  // 1. Generate the date range for the chart (Monday -> Sunday of current week)
  const today = profile.simulatedDate || new Date();
  const start = startOfWeek(today, { weekStartsOn: 1 }); // Monday
  const end = endOfWeek(today, { weekStartsOn: 1 }); // Sunday
  
  const days = eachDayOfInterval({ start, end });
  
  // 2. Build the data array
  const data = days.map(day => {
    const dateStr = format(day, 'yyyy-MM-dd');
    
    // Find log for this day
    // We prioritize morning logs for the trend line
    const log = logs.find(l => format(new Date(l.date), 'yyyy-MM-dd') === dateStr && (l.type === 'morning' || l.type === 'weigh-in'))
             || logs.find(l => format(new Date(l.date), 'yyyy-MM-dd') === dateStr);
             
    // Calculate Target Line for this specific day
    // Simple linear descent from "Monday Baseline" to "Weigh-in Target"
    // Baseline is taken from profile.currentWeight if it's Monday, else we calculate back
    const daysFromStart = differenceInDays(day, start);
    const totalDays = 5; // Mon-Fri cut
    const startWeight = profile.currentWeight; // Use user's actual weight as anchor
    const endWeight = profile.targetWeightClass;
    
    let target = null;
    if (daysFromStart <= 5) {
        // Only show target line if we are descending
        if (startWeight > endWeight) {
             target = startWeight - ((startWeight - endWeight) * (daysFromStart / totalDays));
        } else {
             target = endWeight; // Flat line if already under
        }
    } else {
        target = endWeight; // Post-weigh-in flatline
    }

    return {
      date: format(day, 'EEE'), // Mon, Tue...
      fullDate: dateStr,
      weight: log ? log.weight : null,
      target: parseFloat(target.toFixed(1)),
      isToday: format(day, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
    };
  });

  return (
    <Card className="border-muted bg-card">
      <CardHeader className="pb-2 pt-4 py-3 border-b border-muted/50">
        <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
           <Activity className="w-3.5 h-3.5" /> Weight Trend
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 h-[200px] mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" opacity={0.4} />
            <XAxis 
                dataKey="date" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} 
                dy={10}
            />
            <YAxis 
                domain={['dataMin - 2', 'dataMax + 2']} 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            />
            <Tooltip 
                contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
                formatter={(value: number) => [`${value} lbs`, '']}
                labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: '0.25rem' }}
            />
            {/* Target Line (Guide) */}
            <Line 
                type="monotone" 
                dataKey="target" 
                stroke="hsl(var(--muted-foreground))" 
                strokeWidth={2} 
                strokeDasharray="4 4" 
                dot={false}
                opacity={0.5}
                activeDot={false}
            />
            {/* Actual Weight Line */}
            <Line 
                type="monotone" 
                dataKey="weight" 
                stroke="hsl(var(--primary))" 
                strokeWidth={3} 
                dot={{ r: 4, fill: 'hsl(var(--background))', strokeWidth: 2 }}
                activeDot={{ r: 6, fill: 'hsl(var(--primary))' }}
                connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}