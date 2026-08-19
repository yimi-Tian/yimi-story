import { Component, type ErrorInfo, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Production UI intentionally avoids exposing stack or environment details.
  }
  render() {
    if (this.state.failed) {
      return <main className="fatal-error" role="alert"><h1>後台暫時無法載入</h1><p>請重新整理頁面；若問題持續發生，請聯絡系統管理員。</p><button type="button" onClick={() => window.location.reload()}>重新整理</button></main>;
    }
    return this.props.children;
  }
}
