import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Parking dashboard render failure", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="error-page" role="alert">
          <h1>We could not load the dashboard</h1>
          <p>Refresh the page to try again. Your parking data has not been changed.</p>
          <button className="button button-primary" onClick={() => window.location.reload()}>
            Refresh dashboard
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
