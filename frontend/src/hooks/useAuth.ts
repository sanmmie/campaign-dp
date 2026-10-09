import { useAuthStore } from '../store';

export function useAuth() {
  const { user, token, isAdmin, isGuest } = useAuthStore();
  return { user, token, isAdmin, isGuest, isAuthenticated: !!user };
}