import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="bg-base text-primary"
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: '1rem',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Something went wrong</h1>
          <p className="text-secondary" style={{ maxWidth: '48ch' }}>
            An unexpected error occurred and this screen could not be shown. Reload the
            application to continue. If it happens again, contact your administrator.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded font-semibold transition-all hover:brightness-110"
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              backgroundColor: '#D97706',
              color: '#151517',
              cursor: 'pointer',
            }}
          >
            Reload application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;