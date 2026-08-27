import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

class Boundary extends Component<{ children: ReactNode; listPath: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Never expose draft payloads, signed URLs, identifiers or stacks in production logs.
  }
  render() {
    if (this.state.failed) return <section className="page-error" role="alert"><h1>無法載入此筆預覽</h1><p>請返回列表後重試；其他後台功能仍可繼續使用。</p><Link className="button button--secondary" to={this.props.listPath}>返回列表</Link></section>;
    return this.props.children;
  }
}

export function PreviewBoundary({ type, children }: { type: "class_result" | "activity"; children: ReactNode }) {
  const location = useLocation();
  return <Boundary key={location.pathname} listPath={type === "class_result" ? "/class-results" : "/activities"}>{children}</Boundary>;
}
