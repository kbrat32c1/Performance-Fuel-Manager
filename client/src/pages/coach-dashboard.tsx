import { MobileLayout } from "@/components/mobile-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { format } from "date-fns";
import { AlertTriangle, CheckCircle, Flame, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

// Mock Data for Team
const TEAM = [
  { id: 1, name: "J. Burroughs", weight: 165.4, class: 165, status: 'on-track', track: 'B', lastLog: new Date() },
  { id: 2, name: "K. Dake", weight: 178.2, class: 174, status: 'borderline', track: 'A', lastLog: new Date(Date.now() - 3600000) },
  { id: 3, name: "D. Taylor", weight: 198.5, class: 184, status: 'risk', track: 'A', lastLog: new Date(Date.now() - 7200000 * 5) },
  { id: 4, name: "S. O'Malley", weight: 135.0, class: 133, status: 'on-track', track: 'B', lastLog: new Date() },
];

export default function CoachDashboard() {
  return (
    <MobileLayout>
      <div className="space-y-6">
        <header className="flex justify-between items-center mb-2">
          <div>
            <h2 className="text-sm text-muted-foreground font-mono uppercase tracking-widest">Roster</h2>
            <h1 className="text-3xl font-heading font-bold uppercase italic">
              Varsity Team
            </h1>
          </div>
          <Badge variant="outline" className="font-mono">4 Athletes</Badge>
        </header>

        {/* Risk Alerts */}
        {TEAM.some(a => a.status === 'risk') && (
          <Card className="bg-destructive/10 border-destructive">
            <CardContent className="p-4 flex items-start gap-4">
              <AlertTriangle className="text-destructive w-6 h-6 shrink-0 mt-1" />
              <div>
                <h4 className="font-bold text-destructive uppercase">Risk Alert</h4>
                <p className="text-sm text-muted-foreground">Taylor is 14.5 lbs over (7.8%) with 5 days to weigh-in. Dehydration trajectory detected.</p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {TEAM.map((athlete) => (
            <AthleteCard key={athlete.id} athlete={athlete} />
          ))}
        </div>
      </div>
    </MobileLayout>
  );
}

function AthleteCard({ athlete }: any) {
  const statusColor = athlete.status === 'on-track' ? 'bg-primary' : athlete.status === 'borderline' ? 'bg-chart-3' : 'bg-destructive';
  const StatusIcon = athlete.status === 'on-track' ? CheckCircle : athlete.status === 'borderline' ? AlertTriangle : Flame;

  return (
    <Card className="hover:bg-muted/5 transition-colors cursor-pointer group">
      <CardContent className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar className="h-12 w-12 border-2 border-muted bg-muted">
              <AvatarFallback className="font-heading font-bold bg-muted text-muted-foreground">
                {athlete.name.split(' ').map((n:any) => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
            <div className={cn("absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-background", statusColor)} />
          </div>
          
          <div>
            <h3 className="font-bold text-lg leading-none group-hover:text-primary transition-colors">{athlete.name}</h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
              <span className="font-mono">{athlete.weight} lbs</span>
              <span>•</span>
              <span className="uppercase">{athlete.class} Class</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
           <Badge variant="secondary" className="font-mono text-[10px] uppercase h-5">
             Track {athlete.track}
             {athlete.track === 'A' && <Lock className="w-2 h-2 ml-1 opacity-50" />}
           </Badge>
           <span className="text-[10px] text-muted-foreground">
             {format(athlete.lastLog, 'h:mm a')}
           </span>
        </div>
      </CardContent>
    </Card>
  );
}
