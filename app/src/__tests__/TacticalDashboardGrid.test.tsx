import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import TacticalDashboardGrid from '@/components/dashboard/TacticalDashboardGrid';

// The 3D backdrop needs WebGL, which jsdom has none of. The Canvas is stubbed so
// the test can assert the wrapper the grid renders, which is what the dashboard
// KPI ribbon depends on: it must be an absolutely-positioned, non-flow layer so it
// cannot push the KPI overlay out of the 120px ribbon and clip it. A second in-flow
// `.kpi-canvas-container` here is exactly the 2026-10-19 regression (N11/v1.1-18).
vi.mock('@react-three/fiber', () => ({
  Canvas: () => <div data-testid="r3f-canvas" />,
  useFrame: () => {},
  useThree: () => ({ camera: undefined, gl: { setClearColor: () => {} } }),
}));

describe('TacticalDashboardGrid', () => {
  it('renders into an absolute layer, not a second in-flow kpi container (N11)', () => {
    const { container } = render(<TacticalDashboardGrid />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('kpi-canvas-layer');
    expect(root.className).not.toContain('kpi-canvas-container');
  });
});
