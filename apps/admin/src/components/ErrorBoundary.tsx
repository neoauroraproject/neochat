import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, Heading, Text } from "@neochat/ui";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Admin ErrorBoundary:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-dvh grid place-items-center p-6 bg-[var(--nc-bg)]">
          <div className="max-w-md text-center space-y-4">
            <Heading level={2}>Something went wrong</Heading>
            <Text muted>{this.state.error.message}</Text>
            <Button type="button" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
