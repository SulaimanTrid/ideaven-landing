"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * TASK 66 §37: ONE runtime error boundary. A fault inside a project runtime
 * (a scene loop, a runtime node, a 3D frame) must never take down the
 * Builder shell or a published page — it is caught HERE, shown honestly at
 * the boundary, and reported to the caller (the preview surfaces it in the
 * runtime trace / diagnostics; the published page shows a real failure).
 * Used by PreviewMode and LiveApp — there is no second boundary.
 */

interface Props {
  /** Human surface name in the failure message ("Preview", "Published app"). */
  surface: string;
  /** Called when a runtime fault is caught (for trace/diagnostics). */
  onRuntimeError?: (message: string) => void;
  /** Offered so the user can re-run after a fault. */
  onRetry?: () => void;
  children: ReactNode;
}

interface State {
  error: string | null;
}

export class RuntimeBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onRuntimeError?.(error.message);
    if (typeof console !== "undefined") {
      console.error(`[${this.props.surface}] runtime fault:`, error.message, info.componentStack?.slice(0, 300));
    }
  }

  private retry = () => {
    this.setState({ error: null });
    this.props.onRetry?.();
  };

  override render() {
    if (this.state.error !== null) {
      return (
        <div
          data-runtime-state="failed"
          role="alert"
          className="flex h-full min-h-[220px] w-full flex-col items-center justify-center gap-3 bg-[#0c0f17] p-8 text-center"
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-rose">
            Runtime failed
          </p>
          <p className="max-w-md text-[13px] leading-5 text-fog">
            The {this.props.surface} runtime stopped: {this.state.error}
          </p>
          {this.props.onRetry ? (
            <button
              type="button"
              onClick={this.retry}
              className="h-8 rounded-lg border border-line px-3 text-[12px] font-medium text-fog transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
            >
              Try again
            </button>
          ) : null}
        </div>
      );
    }
    return this.props.children;
  }
}
