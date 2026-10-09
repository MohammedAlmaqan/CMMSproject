import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, UserRole } from '@/types';
import { authService } from '@/services/authService';
import { roleHierarchy } from '@/lib/rbac';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  switchRole: (role: UserRole) => void;
  hasPermission: (requiredRoles: UserRole[]) => boolean;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      loading: false,
      error: null,

      login: async (username: string, password: string) => {
        set({ loading: true, error: null });
        try {
          const user = await authService.login(username, password);
          set({ user, isAuthenticated: true, loading: false });
          return true;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Login failed';
        set({ loading: false, error: msg });
          return false;
        }
      },

      logout: () => {
        authService.logout();
        set({ user: null, isAuthenticated: false });
      },

      switchRole: (role: UserRole) => {
        const current = get().user;
        if (current) {
          set({ user: { ...current, role } });
        }
      },

      hasPermission: (requiredRoles: UserRole[]) => {
        const user = get().user;
        if (!user) return false;
        const userLevel = roleHierarchy[user.role];
        return requiredRoles.some(
          (role) => roleHierarchy[role] <= userLevel
        );
      },

      clearError: () => set({ error: null }),
    }),
    { name: 'cmms-auth' }
  )
);
