// ============================================================
// Auth Store — Zustand
// ============================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, UserRole } from '@/types';
import { mockUsers } from '@/data/mockData';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => boolean;
  logout: () => void;
  switchRole: (role: UserRole) => void;
  hasPermission: (requiredRoles: UserRole[]) => boolean;
}

const roleHierarchy: Record<UserRole, number> = {
  'Administrator': 6,
  'Maintenance Planner': 5,
  'Maintenance Supervisor': 4,
  'Technician': 3,
  'Requester': 2,
  'View-Only': 1,
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,

      login: (username: string, _password: string) => {
        const found = mockUsers.find(
          (u) => u.username === username && u.isActive
        );
        if (found) {
          set({ user: found, isAuthenticated: true });
          return true;
        }
        // Allow any password for demo - match by username only
        const fallback = mockUsers.find((u) => u.username === username);
        if (fallback) {
          set({ user: fallback, isAuthenticated: true });
          return true;
        }
        return false;
      },

      logout: () => {
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
    }),
    { name: 'cmms-auth' }
  )
);
