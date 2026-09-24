import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

const ResizeObserverMock = class {
  observe = (): void => {};
  unobserve = (): void => {};
  disconnect = (): void => {};
} as unknown as typeof ResizeObserver;

if (!window.ResizeObserver) {
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: ResizeObserverMock,
  });
}

if (window.HTMLElement && typeof window.HTMLElement.prototype.scrollIntoView !== 'function') {
  (window.HTMLElement.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
}