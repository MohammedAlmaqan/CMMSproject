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
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            padding: '2rem',
            fontFamily: 'system-ui, sans-serif',
            color: '#0f172a',
            background: '#f8fafc',
          }}
        >
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Something went wrong</h1>
          <p style={{ color: '#b91c1c', marginBottom: '1rem' }}>{this.state.error.message}</p>
          <pre
            style={{
              maxWidth: '80ch',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: '#1e293b',
              color: '#e2e8f0',
              padding: '1rem',
              borderRadius: '0.5rem',
              overflow: 'auto',
              marginBottom: '1rem',
            }}
          >
            {this.state.error.stack}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              border: 'none',
              background: '#2563eb',
              color: '#ffffff',
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