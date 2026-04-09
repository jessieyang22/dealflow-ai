import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/lib/auth";
import { useState, useEffect } from "react";
import Landing from "@/pages/landing";
import Home from "@/pages/home";
import Pipeline from "@/pages/pipeline";
import Comps from "@/pages/comps";
import MarketData from "@/pages/market-data";
import SharedAnalysis from "@/pages/shared-analysis";
import AdminPage from "@/pages/admin";
import PricingPage from "@/pages/pricing";
import PrecedentsPage from "@/pages/precedents";
import ScreenerPage from "@/pages/screener";
import DealMemoPage from "@/pages/deal-memo";
import LBOCalculator from "@/pages/lbo";
import DCFCalculator from "@/pages/dcf";
import FootballField from "@/pages/football-field";
import AccretionDilution from "@/pages/accretion";
import SynergyCalculator from "@/pages/synergies";
import DealWire from "@/pages/deal-wire";
import DealRoom from "@/pages/deal-room";
import MergerModel from "@/pages/merger-model";
import EarningsCalendar from "@/pages/earnings-calendar";
import NotFound from "@/pages/not-found";
import OnboardingModal from "@/components/OnboardingModal";

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (user && !user.onboardingRole) {
      // Small delay so the auth toast shows first
      const t = setTimeout(() => setShowOnboarding(true), 1200);
      return () => clearTimeout(t);
    }
  }, [user?.id]);

  return (
    <>
      {children}
      <OnboardingModal
        open={showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />
    </>
  );
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/"               component={Landing} />
      <Route path="/analyze"        component={Home} />
      <Route path="/pipeline"       component={Pipeline} />
      <Route path="/comps"          component={Comps} />
      <Route path="/market"         component={MarketData} />
      <Route path="/pricing"        component={PricingPage} />
      <Route path="/precedents"     component={PrecedentsPage} />
      <Route path="/screener"       component={ScreenerPage} />
      <Route path="/memo/:id"       component={DealMemoPage} />
      <Route path="/lbo"             component={LBOCalculator} />
      <Route path="/dcf"             component={DCFCalculator} />
      <Route path="/football-field"  component={FootballField} />
      <Route path="/accretion"      component={AccretionDilution} />
      <Route path="/synergies"       component={SynergyCalculator} />
      <Route path="/deal-wire"       component={DealWire} />
      <Route path="/deal-room"       component={DealRoom} />
      <Route path="/merger-model"    component={MergerModel} />
      <Route path="/earnings"        component={EarningsCalendar} />
      <Route path="/admin"          component={AdminPage} />
      <Route path="/share/:token"   component={SharedAnalysis} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router hook={useHashLocation}>
          <OnboardingGate>
            <AppRoutes />
          </OnboardingGate>
        </Router>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
