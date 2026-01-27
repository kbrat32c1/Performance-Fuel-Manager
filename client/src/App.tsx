import { Switch, Route } from "wouter";
import { AuthProvider } from "./lib/auth";
import { StoreProvider } from "./lib/store";
import { ThemeProvider } from "./lib/theme";
import { Toaster } from "@/components/ui/toaster";
import { ProtectedRoute } from "./components/protected-route";
import { ErrorBoundary } from "./components/error-boundary";
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
      <Route path="/onboarding">
        <ProtectedRoute>
          <Onboarding />
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/weekly">
        <ProtectedRoute>
          <Weekly />
        </ProtectedRoute>
      </Route>
      <Route path="/history">
        <ProtectedRoute>
          <History />
        </ProtectedRoute>
      </Route>
      <Route path="/recovery">
        <ProtectedRoute>
          <Recovery />
        </ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <StoreProvider>
            <Toaster />
            <Router />
          </StoreProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
