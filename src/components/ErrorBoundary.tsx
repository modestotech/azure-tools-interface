import { Component, type ReactNode } from 'react'

export interface ErrorBoundaryProps {
  readonly children: ReactNode
  /** What to show instead of the children once they have thrown. */
  readonly fallback: (props: { error: Error; reset: () => void }) => ReactNode
  /** The boundary clears its error when any of these change (e.g. another API is chosen). */
  readonly resetKeys: readonly unknown[]
}

interface ErrorBoundaryState {
  readonly error: Error | undefined
}

function changed(before: readonly unknown[], after: readonly unknown[]): boolean {
  return before.length !== after.length || before.some((value, i) => !Object.is(value, after[i]))
}

/**
 * Keeps an error thrown while rendering (or loading a lazy chunk) inside the part of the page
 * that failed, so the rest stays usable. React has no hook for this, hence the class. React
 * still reports the error to the console; nothing is sent anywhere.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: undefined }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  override componentDidUpdate(previous: ErrorBoundaryProps): void {
    if (this.state.error && changed(previous.resetKeys, this.props.resetKeys)) this.reset()
  }

  reset = (): void => {
    this.setState({ error: undefined })
  }

  override render(): ReactNode {
    const { error } = this.state
    return error ? this.props.fallback({ error, reset: this.reset }) : this.props.children
  }
}
