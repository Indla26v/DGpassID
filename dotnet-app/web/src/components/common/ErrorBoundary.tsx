import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-8 max-w-lg w-full text-center space-y-5">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
              <AlertCircle className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#0B2545]">Something went wrong</h2>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                An unexpected display error occurred. You can reload the workspace or check your connection.
              </p>
            </div>
            {this.state.error && (
              <div className="text-left bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-mono text-slate-700 overflow-x-auto max-h-40">
                {this.state.error.message}
              </div>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-full bg-[#0B2545] text-white px-6 py-2.5 text-sm font-semibold hover:bg-[#123863] transition shadow-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Workspace
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
