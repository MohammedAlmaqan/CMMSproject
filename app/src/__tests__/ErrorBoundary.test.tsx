import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '@/components/ErrorBoundary';

function Boom(): never {
  throw new Error('SECRET_MESSAGE_MARKER');
}

describe('ErrorBoundary (N15)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a generic fallback and never the thrown message or stack (N15)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload application' })).toBeInTheDocument();
    expect(screen.queryByText(/SECRET_MESSAGE_MARKER/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('SECRET_MESSAGE_MARKER');
    expect(document.body.textContent).not.toMatch(/ErrorBoundary\.tsx:\d/);
    expect(spy).toHaveBeenCalled();
  });

  it('renders its children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <div>CHILD_SENTINEL</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('CHILD_SENTINEL')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });
});
