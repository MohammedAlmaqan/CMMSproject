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
  logout: () => {
    setAuthToken(null);
  },
};
