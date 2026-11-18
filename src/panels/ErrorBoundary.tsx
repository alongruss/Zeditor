import { Component, Fragment, type ComponentChildren } from 'preact';
import { recoverFromError } from '../state/recovery';

interface ErrorBoundaryProps {
  /** What this part of the editor is called, for the message ("the Inspector"). */
  readonly area: string;
  readonly children: ComponentChildren;
}

interface ErrorBoundaryState {
  readonly failed: boolean;
  /** Bumped to build the children afresh. */
  readonly attempt: number;
}

/**
 * Keeps one part of the editor from taking the whole page down. If it fails
 * to render, the editor steps back to the last scene that drew and the part
 * is built again; if that doesn't help, it shows a short note with Try again.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false, attempt: 0 };

  componentDidCatch(error: unknown): void {
    const recovery = recoverFromError(error);
    this.setState(({ attempt }) => (recovery === 'rewound' ? { failed: false, attempt: attempt + 1 } : { failed: true, attempt }));
  }

  private retry = () => {
    this.setState(({ attempt }) => ({ failed: false, attempt: attempt + 1 }));
  };

  render({ area, children }: ErrorBoundaryProps, { failed, attempt }: ErrorBoundaryState) {
    if (failed) {
      return (
        <div class="snag" role="alert">
          <p>{area} hit a snag. Your scene is still here.</p>
          <button type="button" onClick={this.retry}>
            Try again
          </button>
        </div>
      );
    }
    return <Fragment key={attempt}>{children}</Fragment>;
  }
}
