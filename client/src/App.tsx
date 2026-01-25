import { Switch, Route } from "wouter";
import { StoreProvider } from "./lib/store";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Onboarding from "@/pages/onboarding";
import Recovery from "@/pages/recovery";
import Landing from "@/pages/landing";
import CoachDashboard from "@/pages/coach-dashboard";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/recovery" component={Recovery} />
      <Route path="/coach" component={CoachDashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <StoreProvider>
        <Toaster />
        <Router />
    </StoreProvider>
  );
}

export default App;
