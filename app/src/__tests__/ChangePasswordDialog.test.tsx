// G2 regression: the app previously offered no way to change a password even
// though PUT /users/{id}/password (self-service with currentPassword, or an
// Administrator reset without it) and userService.changePassword both existed.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChangePasswordDialog from '@/components/ChangePasswordDialog';
import { userService } from '@/services/userService';
import { ApiError } from '@/lib/api';

vi.mock('@/services/userService', () => ({
  userService: { changePassword: vi.fn() },
}));

describe('ChangePasswordDialog', () => {
  beforeEach(() => {
    vi.mocked(userService.changePassword).mockReset();
  });

  it('sends currentPassword and newPassword for a self-service change', async () => {
    vi.mocked(userService.changePassword).mockResolvedValue({ message: 'ok' });
    const user = userEvent.setup();
    render(<ChangePasswordDialog userId="u-tech" open onClose={vi.fn()} />);

    await user.type(screen.getByLabelText('Current password'), 'old-password');
    await user.type(screen.getByLabelText('New password'), 'brand-new-pw');
    await user.type(screen.getByLabelText('Confirm new password'), 'brand-new-pw');
    await user.click(screen.getByRole('button', { name: 'Change Password' }));

    await waitFor(() =>
      expect(vi.mocked(userService.changePassword)).toHaveBeenCalledWith('u-tech', {
        currentPassword: 'old-password',
        newPassword: 'brand-new-pw',
      })
    );
  });

  it('omits currentPassword when an Administrator resets another account', async () => {
    vi.mocked(userService.changePassword).mockResolvedValue({ message: 'ok' });
    const user = userEvent.setup();
    render(
      <ChangePasswordDialog userId="u-target" adminMode open onClose={vi.fn()} />
    );

    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('New password'), 'reset-pw-123');
    await user.type(screen.getByLabelText('Confirm new password'), 'reset-pw-123');
    await user.click(screen.getByRole('button', { name: 'Reset Password' }));

    await waitFor(() =>
      expect(vi.mocked(userService.changePassword)).toHaveBeenCalledWith('u-target', {
        newPassword: 'reset-pw-123',
      })
    );
  });

  it('rejects a confirmation that does not match the new password', async () => {
    const user = userEvent.setup();
    render(<ChangePasswordDialog userId="u-tech" open onClose={vi.fn()} />);

    await user.type(screen.getByLabelText('Current password'), 'old-password');
    await user.type(screen.getByLabelText('New password'), 'brand-new-pw');
    await user.type(screen.getByLabelText('Confirm new password'), 'different-pw');
    await user.click(screen.getByRole('button', { name: 'Change Password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'New password and confirmation do not match'
    );
    expect(vi.mocked(userService.changePassword)).not.toHaveBeenCalled();
  });

  it('surfaces the API rejection when the current password is wrong', async () => {
    vi.mocked(userService.changePassword).mockRejectedValue(
      new ApiError(400, 'Current password is incorrect')
    );
    const user = userEvent.setup();
    render(<ChangePasswordDialog userId="u-tech" open onClose={vi.fn()} />);

    await user.type(screen.getByLabelText('Current password'), 'wrong-pw');
    await user.type(screen.getByLabelText('New password'), 'brand-new-pw');
    await user.type(screen.getByLabelText('Confirm new password'), 'brand-new-pw');
    await user.click(screen.getByRole('button', { name: 'Change Password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Current password is incorrect'
    );
  });

  it('renders nothing while closed', () => {
    const { container } = render(
      <ChangePasswordDialog userId="u-tech" open={false} onClose={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
