import { Switch, Route } from "wouter";
import { AuthProvider } from "./lib/auth";
import { StoreProvider } from "./lib/store";
import { ThemeProvider } from "./lib/theme";
import { Toaster } from "@/components/ui/toaster";
import { ProtectedRoute } from "./components/protected-route";
import { ErrorBoundary, PageErrorBoundary } from "./components/error-boundary";
// Old floating AI chat removed - replaced by unified AiCoachProactive on dashboard
import { useNotificationScheduler } from "@/hooks/use-notification-scheduler";
import { useStore } from "@/lib/store";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Onboarding from "@/pages/onboarding";
import Recovery from "@/pages/recovery";
import Landing from "@/pages/landing";
import Weekly from "@/pages/weekly";
import History from "@/pages/history";
import Fuel from "@/pages/fuel";
import Food from "@/pages/food";
import CoachView from "@/pages/coach-view";
import Reports from "@/pages/reports";

function Router() {
  return (
    <Switch>
      <Route path="/coach/:token" component={CoachView} />
      <Route path="/" component={Landing} />
      <Route path="/onboarding">
        <ProtectedRoute>
          <PageErrorBoundary pageName="Onboarding">
            <Onboarding />
          </PageErrorBoundary>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute>
          <PageErrorBoundary pageName="Dashboard">
            <Dashboard />
          </PageErrorBoundary>
        </ProtectedRoute>
      </Route>
      <Route path="/weekly">
        <ProtectedRoute>
          <PageErrorBoundary pageName="Weekly">
            <Weekly />
          </PageErrorBoundary>
        </ProtectedRoute>
      </Route>
      <Route path="/history">
        <ProtectedRoute>
          <PageErrorBoundary pageName="History">
            <History />
          </PageErrorBoundary>
        </ProtectedRoute>
      </Route>
      <Route path="/reports">
        <ProtectedRoute>
          <PageErrorBoundary pageName="Reports">
            <Reports />
          </PageErrorBoundary>
        </ProtectedRoute>
      </Route>
      <Route path="/fuel">
        <ProtectedRoute>
          <PageErrorBoundary pageName="Fuel">
            <Fuel />
          </PageErrorBoundary>
        </ProtectedRoute>
      </Route>
      <Route path="/food">
        <ProtectedRoute>
          <PageErrorBoundary pageName="Food">
            <Food />
          </PageErrorBoundary>
        </ProtectedRoute>
      </Route>
      <Route path="/recovery">
        <ProtectedRoute>
          <PageErrorBoundary pageName="Recovery">
            <Recovery />
          </PageErrorBoundary>
        </ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function NotificationScheduler() {
  try {
    const { logs } = useStore();
    const today = new Date();
    const hasLog = (type: string) => logs.some(log => {
      const d = new Date(log.date);
      return log.type === type &&
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate();
    });
    useNotificationScheduler({
      morning: hasLog('morning'),
      prePractice: hasLog('pre-practice'),
      beforeBed: hasLog('before-bed'),
    });
  } catch {
    // Store not ready yet (no auth) — skip
  }
  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <StoreProvider>
            <Toaster />
            <Router />
            <NotificationScheduler />
          </StoreProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
