/**
 * Auth context — JWT stored in React state (no localStorage).
 * Token is kept in module-level variable so it survives re-renders
 * but is lost on page reload (intentional for sandboxed iframe env).
 */
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { apiRequest } from "@/lib/queryClient";

// Resolve API base the same way queryClient does so auth calls get proxied on deployed site
const API_BASE = ("__PORT_5000__" as string).startsWith("__") ? "" : "__PORT_5000__";

export interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  analysesRun?: number;
  plan?: "free" | "pro" | "teams";
  onboardingRole?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  // Guest analysis tracking
  guestCount: number;
  incrementGuestCount: () => void;
}

// Module-level token so it's accessible outside React tree (e.g., queryClient fetch)
let _token: string | null = null;
export function getAuthToken(): string | null { return _token; }

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [guestCount, setGuestCount] = useState(0);

  function setAuth(t: string, u: User) {
    _token = t;
    setToken(t);
    setUser(u);
  }

  function clearAuth() {
    _token = null;
    setToken(null);
    setUser(null);
  }

  async function login(email: string, password: string) {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Login failed");
      }
      const data = await res.json();
      setAuth(data.token, data.user);
    } finally {
      setIsLoading(false);
    }
  }

  async function signup(email: string, name: string, password: string) {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Signup failed");
      }
      const data = await res.json();
      setAuth(data.token, data.user);
    } finally {
      setIsLoading(false);
    }
  }

  function logout() {
    clearAuth();
  }

  function incrementGuestCount() {
    setGuestCount(c => c + 1);
  }

  return (
    <AuthContext.Provider value={{
      user, token, login, signup, logout, isLoading, guestCount, incrementGuestCount,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export const FREE_LIMIT = Infinity;
