import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import CommandPalette from '@/components/layout/CommandPalette';
import { useAuthStore } from '@/store/authStore';
import type { User } from '@/types';

const adminUser: User = {
  userId: 'u-admin',
  username: 'admin',
  fullName: 'AdminUser',
  email: 'admin@example.com',
  role: 'Administrator',
  workCenterId: null,
  isActive: true,
  lastLogin: null,
};

// The background button stands in for the page behind the overlay. Without a
// focus trap, Tab walks out of the dialog and lands on it - so its absence
// from the assertions is exactly what "trap" means here.
const renderPalette = (onClose = vi.fn()) => {
  render(
    <MemoryRouter>
      <button type="button">background focus target</button>
      <CommandPalette open onClose={onClose} />
    </MemoryRouter>
  );
  return { onClose, background: screen.getByRole('button', { name: 'background focus target' }) };
};

const getDialog = () => screen.getByRole('dialog', { name: 'Command palette' });
const getInput = () => screen.getByLabelText('Search commands, navigate, or create');

describe('CommandPalette focus trap (v1.1-11)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: adminUser, isAuthenticated: true, loading: false, error: null });
    vi.clearAllMocks();
  });

  it('holds Tab inside the dialog and wraps back to the input', async () => {
    const user = userEvent.setup();
    const { onClose, background } = renderPalette();

    const input = getInput();
    await waitFor(() => expect(document.activeElement).toBe(input));

    const buttons = getDialog().querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);

    // One Tab per command button walks input -> b1 -> ... -> bN; the next one
    // must wrap to the input, never touching the background target.
    for (let i = 0; i < buttons.length + 1; i++) {
      await user.keyboard('{Tab}');
      expect(document.activeElement).not.toBe(background);
      expect(getDialog().contains(document.activeElement)).toBe(true);
    }
    expect(document.activeElement).toBe(input);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('wraps Shift+Tab from the input to the last command button, not to the page behind', async () => {
    const user = userEvent.setup();
    const { background } = renderPalette();

    const input = getInput();
    await waitFor(() => expect(document.activeElement).toBe(input));

    await user.keyboard('{Shift>}{Tab}{/Shift}');

    const buttons = getDialog().querySelectorAll('button');
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    expect(document.activeElement).not.toBe(background);
  });

  it('keeps focus on the input when there are no command buttons to cycle through', async () => {
    const user = userEvent.setup();
    renderPalette();

    const input = getInput();
    await waitFor(() => expect(document.activeElement).toBe(input));

    await user.type(input, 'zzzznope');
    expect(screen.getByText(/No commands found/)).toBeInTheDocument();

    await user.keyboard('{Tab}');
    expect(document.activeElement).toBe(input);
  });

  it('still closes on Escape', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPalette();

    await waitFor(() => expect(document.activeElement).toBe(getInput()));
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('still runs the selected command on Enter', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPalette();

    await waitFor(() => expect(document.activeElement).toBe(getInput()));
    await user.keyboard('{Enter}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
