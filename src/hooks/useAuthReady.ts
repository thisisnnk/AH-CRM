import { useAuth } from "@/contexts/AuthContext";

export function useAuthReady() {
  const { user, role, loading } = useAuth();
  return {
    isReady: !loading && !!user && role !== null,
    user,
    role,
    loading,
  };
}
