import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";

type Role = "admin" | "employee" | "execution" | "accounts" | "itinerary" | null;

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
  const queryClient = useQueryClient();

  // Tracks which user ID we last kicked off a fetch for.
  // Discards stale responses if a newer user has taken over.
  const fetchedForRef = useRef<string | null>(null);

  const fetchUserData = async (userId: string) => {
    fetchedForRef.current = userId;
    try {
      const [roleRes, profileRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
        supabase.from("profiles").select("name, email, whatsapp, is_active").eq("user_id", userId).maybeSingle(),
      ]);

      // Discard if a newer call has started
      if (fetchedForRef.current !== userId) return;

      if (roleRes.error) console.error("Role fetch error:", roleRes.error.message);
      if (profileRes.error) console.error("Profile fetch error:", profileRes.error.message);

      if (profileRes.data && !profileRes.data.is_active) {
        supabase.auth.signOut({ scope: "local" }).catch(() => {});
        return;
      }

      if (roleRes.data?.role) setRole(roleRes.data.role as Role);
      if (profileRes.data) {
        setProfile({
          name: profileRes.data.name,
          email: profileRes.data.email,
          whatsapp: profileRes.data.whatsapp,
        });
      }
    } catch (err) {
      console.error("Unexpected error in fetchUserData:", err);
    }
  };

  useEffect(() => {
    let mounted = true;

    // Step 1 — getSession() resolves the current session immediately from
    // localStorage without a network round-trip. This is the fastest path
    // on page reload and ensures loading=false even if the listener is slow.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        await fetchUserData(currentUser.id);
      }
      if (mounted) setLoading(false);
    });

    // Step 2 — onAuthStateChange handles subsequent events: SIGNED_IN after
    // login, TOKEN_REFRESHED when the JWT auto-renews, SIGNED_OUT on logout.
    // We skip the very first event (INITIAL_SESSION) because getSession()
    // already handles it — processing it twice causes a double fetch.
    let initialEventSkipped = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        // Skip the first INITIAL_SESSION — already handled by getSession() above
        if (!initialEventSkipped) {
          initialEventSkipped = true;
          return;
        }

        const currentUser = session?.user ?? null;
        setUser(currentUser);

        if (currentUser) {
          await fetchUserData(currentUser.id);
          if (mounted) setLoading(false);
        } else {
          // SIGNED_OUT fired by Supabase (token expiry, another tab, etc.)
          // Do NOT reset fetchedForRef here — if the new user's SIGNED_IN already
          // arrived first, resetting the ref would discard the in-flight fetch and
          // leave role=null forever (spinner stuck). signOut() already clears it.
          setRole(null);
          setProfile(null);
          if (mounted) setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    // Clear all cached query data so the next user starts with a clean slate
    queryClient.clear();
    // Clear auth state immediately so the UI redirects without waiting for network
    setUser(null);
    setRole(null);
    setProfile(null);
    fetchedForRef.current = null;
    supabase.auth.signOut({ scope: "local" }).catch((err) => {
      console.error("Sign out error:", err);
    });
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
