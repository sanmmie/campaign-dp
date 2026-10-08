import { useAuthStore } from '../store';

export function useAuth() {
  const { user, token, isAdmin } = useAuthStore();
  return { user, token, isAdmin, isAuthenticated: !!user };
}