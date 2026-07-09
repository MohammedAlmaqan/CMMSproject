import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hexagon, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, loading, error: storeError, clearError } = useAuthStore();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    const success = await login(username, password);
    if (success) navigate('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#111113' }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Hexagon className="w-12 h-12 text-amber mb-3" strokeWidth={1.2} />
          <h1 className="text-primary text-xl font-bold tracking-tight">CommandPulse</h1>
          <p className="text-secondary text-xs mt-1">Computerized Maintenance Management System</p>
        </div>

        <form onSubmit={handleSubmit} className="industrial-card rounded-lg p-6">
          <div className="mb-4">
            <label className="block text-secondary text-xs font-medium mb-1.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 rounded text-primary text-sm outline-none border border-subtle focus:border-highlight transition-colors"
              style={{ backgroundColor: '#27272A' }}
              required
            />
          </div>

          <div className="mb-5">
            <label className="block text-secondary text-xs font-medium mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full px-3 py-2 pr-10 rounded text-primary text-sm outline-none border border-subtle focus:border-highlight transition-colors"
                style={{ backgroundColor: '#27272A' }}
                required
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-tertiary hover:text-secondary"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {(storeError) && (
            <div className="mb-4 text-red-status text-xs">{storeError}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded text-sm font-semibold transition-all hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-2"
            style={{
              backgroundColor: '#D97706',
              color: '#111113',
              boxShadow: loading ? 'none' : '0 0 15px rgba(217, 119, 6, 0.3)',
            }}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-tertiary mt-4" style={{ fontSize: '11px' }}>
          Demo: use any username from seed data with password "password"
        </p>
      </div>
    </div>
  );
}
