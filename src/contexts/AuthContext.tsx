import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

type Role = "admin" | "employee" | null;

interface AuthContextType {
  user: User | null;
  role: Role;
  profile: { name: string; email: string; whatsapp: string | null } | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [profile, setProfile] = useState<{ name: string; email: string; whatsapp: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const initialSessionHandled = useRef(false);

  const fetchUserData = async (userId: string) => {
    try {
      const [roleRes, profileRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
        supabase.from("profiles").select("name, email, whatsapp, is_active").eq("user_id", userId).maybeSingle(),
      ]);

      if (roleRes.error) {
        console.error("Error fetching user role:", roleRes.error.message);
      }
      if (profileRes.error) {
        console.error("Error fetching user profile:", profileRes.error.message);
      }

      if (profileRes.data && !profileRes.data.is_active) {
        await supabase.auth.signOut();
        return;
      }

      setRole(roleRes.data?.role ?? null);
      setProfile(profileRes.data ? { name: profileRes.data.name, email: profileRes.data.email, whatsapp: profileRes.data.whatsapp } : null);
    } catch (err) {
      console.error("Unexpected error in fetchUserData:", err);
    }
  };

  useEffect(() => {
    // 1. Handle the initial session on mount
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        await fetchUserData(currentUser.id);
      }

      setLoading(false);
      initialSessionHandled.current = true;
    });

    // 2. Listen for subsequent auth state changes (sign-in, sign-out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      // Skip if the initial session hasn't been handled yet —
      // getSession() above already covers the initial load.
      if (!initialSessionHandled.current) return;

      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        await fetchUserData(currentUser.id);
      } else {
        setRole(null);
        setProfile(null);
      }

      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRole(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, role, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
