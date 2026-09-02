import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Catches render errors from a single note / profile so a malformed event
 * doesn't take down the whole app. Give it a `key` (the route path) so a
 * navigation resets it.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[1btc] render error', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-md px-6 py-16 text-center">
          <p className="font-display text-lg font-bold">Something broke on this screen.</p>
          <p className="mt-2 text-sm text-ink-soft">
            A note or profile didn&apos;t load cleanly. The rest of 1btc is fine — try another tab.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
