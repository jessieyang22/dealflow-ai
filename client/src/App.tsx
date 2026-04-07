import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import Landing from "@/pages/landing";
import Home from "@/pages/home";
import Pipeline from "@/pages/pipeline";
import Comps from "@/pages/comps";
import MarketData from "@/pages/market-data";
import SharedAnalysis from "@/pages/shared-analysis";
import AdminPage from "@/pages/admin";
import NotFound from "@/pages/not-found";

function AppRoutes() {
  return (
    <Switch>
      <Route path="/"         component={Landing} />
      <Route path="/analyze"  component={Home} />
      <Route path="/pipeline" component={Pipeline} />
      <Route path="/comps"    component={Comps} />
      <Route path="/market"   component={MarketData} />
      <Route path="/admin"    component={AdminPage} />
      <Route path="/share/:token" component={SharedAnalysis} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useHashLocation}>
        <AppRoutes />
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
