import { Switch, Route } from "wouter";
import { AuthProvider } from "./lib/auth";
import { StoreProvider } from "./lib/store";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Onboarding from "@/pages/onboarding";
import Recovery from "@/pages/recovery";
import Landing from "@/pages/landing";
import Weekly from "@/pages/weekly";
import History from "@/pages/history";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/weekly" component={Weekly} />
      <Route path="/history" component={History} />
      <Route path="/recovery" component={Recovery} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <AuthProvider>
      <StoreProvider>
        <Toaster />
        <Router />
      </StoreProvider>
    </AuthProvider>
  );
}

export default App;
