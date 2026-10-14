import { api, setAuthToken } from '@/lib/api';
import type { User } from '@/types';

interface LoginResponse {
  token: string;
  user: User;
}

export const authService = {
  login: async (username: string, password: string) => {
    const res = await api.post<LoginResponse>('/auth/login', { username, password });
    setAuthToken(res.token);
    return res.user;
  },
  /**
   * Sign out. The client token is dropped first so the UI is signed out
   * immediately, then the server is asked to revoke the session behind the
   * httpOnly refresh cookie. If that call fails the user is still signed out
   * locally and the session expires on its own at the idle/absolute limit.
   */
  logout: async () => {
    setAuthToken(null);
    try {
      await api.post('/auth/logout');
    } catch {
      // Best-effort: local sign-out above is the guarantee.
    }
  },
};
