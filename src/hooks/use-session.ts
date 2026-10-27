import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadUser } from "@/lib/store";
import type { User } from "@/lib/types";

/** Session hook backed by Supabase Auth. Reads after hydration. */
export function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const sync = async (userId: string | null) => {
      const u = userId ? await loadUser(userId).catch(() => null) : null;
      if (!active) return;
      setUser(u);
      setReady(true);
    };
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED") return;
      // defer to avoid calling supabase inside the auth callback
      setTimeout(() => void sync(session?.user.id ?? null), 0);
    });
    supabase.auth.getSession().then(({ data }) => void sync(data.session?.user.id ?? null));
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, ready, isAuthenticated: !!user };
}
