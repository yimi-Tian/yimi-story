import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseClient } from "../lib/supabase";
import { checkAdminAccess, type AdminAccess } from "./admin-access";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "denied" | "inactive" | "error";
export type SignInResult = "success" | "invalid_credentials" | "denied" | "inactive" | "network_error";

export interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  signIn(email: string, password: string): Promise<SignInResult>;
  signOut(): Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function statusFromAccess(access: AdminAccess): AuthStatus {
  if (access === "active") return "authenticated";
  if (access === "inactive") return "inactive";
  if (access === "denied") return "denied";
  return "error";
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);

  const applySession = useCallback(async (session: Session | null) => {
    if (!session?.user) {
      setUser(null);
      setStatus("unauthenticated");
      return;
    }
    const client = getSupabaseClient();
    const access = await checkAdminAccess(client, session.user.id);
    if (access === "active") {
      setUser(session.user);
      setStatus("authenticated");
      return;
    }
    setUser(null);
    setStatus(statusFromAccess(access));
    await client.auth.signOut();
  }, []);

  useEffect(() => {
    let active = true;
    const client = getSupabaseClient();
    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setStatus("error");
      else void applySession(data.session);
    });
    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      if (active) void applySession(session);
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [applySession]);

  const signIn = useCallback(async (email: string, password: string): Promise<SignInResult> => {
    setStatus("loading");
    try {
      const client = getSupabaseClient();
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error || !data.user || !data.session) {
        setStatus("unauthenticated");
        return error?.status && error.status >= 500 ? "network_error" : "invalid_credentials";
      }
      const access = await checkAdminAccess(client, data.user.id);
      if (access !== "active") {
        await client.auth.signOut();
        setUser(null);
        setStatus(statusFromAccess(access));
        return access === "network_error" ? "network_error" : access;
      }
      setUser(data.user);
      setStatus("authenticated");
      return "success";
    } catch {
      setUser(null);
      setStatus("error");
      return "network_error";
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await getSupabaseClient().auth.signOut();
    } finally {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  const value = useMemo(() => ({ status, user, signIn, signOut }), [status, user, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth 必須在 AuthProvider 內使用");
  return value;
}
