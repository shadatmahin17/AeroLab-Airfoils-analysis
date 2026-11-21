import {
  Component,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import { supabase } from "../utils/supabase.ts";
import {
  ensureUserProfile,
  subscribePublicAirfoils,
  subscribePublicBenchmarks,
  subscribeUserProfile,
  type BenchmarkRunDoc,
  type SharedAirfoilDoc,
  type UserProfileDoc,
} from "../lib/airfoilRepository.ts";

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  emailVerified: boolean;
}

function toAppUser(u: SupabaseAuthUser | null): AppUser | null {
  if (!u) return null;
  const meta = u.user_metadata || {};
  const displayName = String(
    meta.full_name || meta.name || u.email?.split("@")[0] || "AeroLab Pilot"
  );
  const photoURL = String(meta.avatar_url || meta.picture || "");
  return {
    uid: u.id,
    email: u.email || "",
    displayName,
    photoURL,
    emailVerified: Boolean(u.email_confirmed_at || u.confirmed_at || u.email),
  };
}

interface SupabaseContextValue {
  user: AppUser | null;
  userProfile: UserProfileDoc | null;
  authReady: boolean;
  authBusy: boolean;
  authError: string | null;
  authNotice: string | null;
  sharedAirfoils: SharedAirfoilDoc[];
  benchmarks: BenchmarkRunDoc[];
  cloudError: string | null;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SupabaseContext = createContext<SupabaseContextValue | null>(null);

export function useSupabase() {
  const ctx = useContext(SupabaseContext);
  if (!ctx) throw new Error("useSupabase must be used inside SupabaseProvider");
  return ctx;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error?.message || "Unexpected application error" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Application ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-[var(--bg)] text-[var(--text)] flex items-center justify-center p-4">
          <div className="max-w-md w-full antigravity-glass rounded-xl p-5 flex flex-col gap-3">
            <h1 className="text-base font-bold text-[#161A1D]">AeroLab Encountered an Error</h1>
            <p className="text-xs text-[#5C6670] font-mono break-all bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn btn-primary-accent btn-sm self-start"
            >
              Reload Workstation
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfileDoc | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [sharedAirfoils, setSharedAirfoils] = useState<SharedAirfoilDoc[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkRunDoc[]>([]);
  const [cloudError, setCloudError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    if (!supabase) {
      setAuthReady(true);
      setCloudError(
        "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to enable pilot sign-in and community sharing."
      );
      return () => {
        alive = false;
      };
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const mapped = toAppUser(data.session?.user ?? null);
      setUser(mapped);
      setAuthReady(true);
      if (mapped) {
        void ensureUserProfile().catch(() => {});
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const mapped = toAppUser(session?.user ?? null);
      setUser(mapped);
      setAuthReady(true);
      if (!mapped) {
        setUserProfile(null);
      } else {
        void ensureUserProfile().catch(() => {});
      }
    });

    const unsubFoils = subscribePublicAirfoils(
      (items) => {
        setSharedAirfoils(items);
        setCloudError(null);
      },
      (err) => setCloudError(err.message)
    );

    const unsubBench = subscribePublicBenchmarks(
      (items) => {
        setBenchmarks(items);
        setCloudError(null);
      },
      (err) => setCloudError(err.message)
    );

    return () => {
      alive = false;
      subscription.unsubscribe();
      unsubFoils();
      unsubBench();
    };
  }, []);

  useEffect(() => {
    if (!authReady || !user) return undefined;
    const unsubProfile = subscribeUserProfile(
      user.uid,
      (profile) => setUserProfile(profile),
      (err) => setCloudError(err.message)
    );
    return () => unsubProfile();
  }, [authReady, user]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      setAuthError("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    setAuthNotice(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const signUpWithEmail = useCallback(
    async (email: string, password: string, displayName?: string) => {
      if (!supabase) {
        setAuthError("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
        return;
      }
      setAuthBusy(true);
      setAuthError(null);
      setAuthNotice(null);
      try {
        const cleanName = (displayName || email.split("@")[0] || "AeroLab Pilot").trim().slice(0, 80);
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: cleanName },
            emailRedirectTo: `${window.location.origin}/profile`,
          },
        });
        if (error) throw error;
        if (!data.session) {
          setAuthNotice(
            "Account created. Check your email inbox for the Supabase confirmation link, then sign in."
          );
        }
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : "Sign-up failed.");
      } finally {
        setAuthBusy(false);
      }
    },
    []
  );

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) {
      setAuthError("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    setAuthNotice(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/profile`,
        },
      });
      if (error) throw error;
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : "Google sign-in is not enabled in Supabase Auth yet."
      );
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthError(null);
    setAuthNotice(null);
    setCloudError(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Sign-out failed.");
    } finally {
      setAuthBusy(false);
    }
  }, []);

  return (
    <SupabaseContext.Provider
      value={{
        user,
        userProfile,
        authReady,
        authBusy,
        authError,
        authNotice,
        sharedAirfoils,
        benchmarks,
        cloudError,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        signOut: handleSignOut,
      }}
    >
      {children}
    </SupabaseContext.Provider>
  );
}
