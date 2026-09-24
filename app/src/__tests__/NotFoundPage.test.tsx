import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import NotFoundPage from '@/pages/NotFoundPage';

function renderNotFound() {
  return render(
    <MemoryRouter initialEntries={['/does-not-exist']}>
      <Routes>
        <Route path="/does-not-exist" element={<NotFoundPage />} />
        <Route path="/dashboard" element={<div>DASHBOARD_SENTINEL</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('NotFoundPage (3.5a)', () => {
  it('renders 404, "Page not found" and a Back to Dashboard link', () => {
    renderNotFound();

    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText('Page not found')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Back to Dashboard' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it('navigates to /dashboard when the Back to Dashboard link is clicked', async () => {
    const user = userEvent.setup();
    renderNotFound();

    await user.click(screen.getByRole('link', { name: 'Back to Dashboard' }));

    expect(await screen.findByText('DASHBOARD_SENTINEL')).toBeInTheDocument();
  });
});