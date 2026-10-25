// ============================================================
// Change Password Dialog — self-service credential rotation (G2)
//
// PUT /api/users/{id}/password accepts either { currentPassword,
// newPassword } for a self-service change (the route verifies the current
// password) or { newPassword } alone for an Administrator resetting another
// account. The sidebar uses the self-service path; the Administration user
// table mounts the same component with `adminMode` for the reset path.
// ============================================================

import { useState } from 'react';
import { KeyRound, Loader2, XCircle } from 'lucide-react';
import { userService } from '@/services/userService';
import { ApiError } from '@/lib/api';

interface ChangePasswordDialogProps {
  userId: string;
  /** True when an Administrator is resetting someone else's password. */
  adminMode?: boolean;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const inputCls =
  'px-2 py-1.5 rounded text-sm text-primary outline-none border border-subtle focus:border-highlight w-full';
const labelCls = 'flex flex-col gap-1 text-xs text-secondary';

export default function ChangePasswordDialog({
  userId,
  adminMode = false,
  open,
  onClose,
  onSuccess,
}: ChangePasswordDialogProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setSuccess(false);
    setSubmitting(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 12) {
      setError('New password must be at least 12 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match');
      return;
    }
    setSubmitting(true);
    try {
      await userService.changePassword(userId, {
        ...(adminMode ? {} : { currentPassword }),
        newPassword,
      });
      setSuccess(true);
      onSuccess?.();
      setTimeout(close, 900);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the password');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      role="dialog"
      aria-modal="true"
      aria-label={adminMode ? 'Reset password' : 'Change password'}
    >
      <form
        onSubmit={submit}
        className="industrial-card rounded-lg p-5 w-full max-w-sm space-y-3"
        style={{ backgroundColor: '#1E1E22' }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-primary text-sm font-semibold flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber" />
            {adminMode ? 'Reset Password' : 'Change Password'}
          </h3>
          <button type="button" onClick={close} aria-label="Close change password" className="text-tertiary hover:text-primary">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-400" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="text-xs text-green-500" role="status">
            Password updated.
          </p>
        )}
        {!adminMode && (
          <label className={labelCls}>
            Current Password
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
              aria-label="Current password"
              className={inputCls}
              style={{ backgroundColor: '#27272A' }}
            />
          </label>
        )}
        <label className={labelCls}>
          New Password
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={12}
            autoComplete="new-password"
            aria-label="New password"
            className={inputCls}
            style={{ backgroundColor: '#27272A' }}
          />
        </label>
        <label className={labelCls}>
          Confirm New Password
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={12}
            autoComplete="new-password"
            aria-label="Confirm new password"
            className={inputCls}
            style={{ backgroundColor: '#27272A' }}
          />
        </label>
        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={submitting}
            className="text-xs px-3 py-1.5 rounded bg-amber font-medium disabled:opacity-50"
            style={{ color: '#111113' }}
          >
            {submitting ? (
              <span className="flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Saving...
              </span>
            ) : adminMode ? (
              'Reset Password'
            ) : (
              'Change Password'
            )}
          </button>
          <button
            type="button"
            onClick={close}
            className="text-xs px-3 py-1.5 rounded border border-subtle text-secondary hover:text-primary"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
