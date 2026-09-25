import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIdleTimeout } from '@/hooks/useIdleTimeout';

const TIMEOUT_MS = 5_000;
const WARNING_MS = 1_000;
const WARNING_TRIGGER_MS = TIMEOUT_MS - WARNING_MS;

function IdleTimeoutHarness({ onTimeout }: { onTimeout: () => void }) {
  const { showWarning, bump } = useIdleTimeout({
    timeoutMs: TIMEOUT_MS,
    warningMs: WARNING_MS,
    onTimeout,
  });

  return (
    <div>
      <span>{showWarning ? 'Session warning visible' : 'Session active'}</span>
      {showWarning && <button onClick={bump}>Stay signed in</button>}
    </div>
  );
}

describe('useIdleTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('shows a warning after the warning threshold', () => {
    render(<IdleTimeoutHarness onTimeout={vi.fn()} />);

    expect(screen.getByText('Session active')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(WARNING_TRIGGER_MS);
    });

    expect(screen.getByText('Session warning visible')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stay signed in' })).toBeInTheDocument();
  });

  it('resets the timer when Stay signed in is clicked', () => {
    const onTimeout = vi.fn();
    render(<IdleTimeoutHarness onTimeout={onTimeout} />);

    act(() => {
      vi.advanceTimersByTime(WARNING_TRIGGER_MS);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Stay signed in' }));

    expect(screen.getByText('Session active')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(TIMEOUT_MS - 1);
    });
    expect(onTimeout).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('calls onTimeout after the full timeout without activity', () => {
    const onTimeout = vi.fn();
    render(<IdleTimeoutHarness onTimeout={onTimeout} />);

    act(() => {
      vi.advanceTimersByTime(TIMEOUT_MS);
    });

    expect(onTimeout).toHaveBeenCalled();
  });
});
