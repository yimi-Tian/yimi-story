import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

class EditorBoundary extends Component<{
  children: ReactNode;
  label: string;
  listPath: string;
}, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Keep production details private; repository integration tests retain safe error codes.
  }
  render() {
    if (this.state.failed) {
      return <section className="page-error" role="alert">
        <h1>無法載入此筆{this.props.label}資料</h1>
        <p>請返回列表後重試；其他後台功能仍可繼續使用。</p>
        <Link className="button button--secondary" to={this.props.listPath}>返回{this.props.label}列表</Link>
      </section>;
    }
    return this.props.children;
  }
}

export function ContentEditorBoundary({ type, children }: {
  type: "class_result" | "activity";
  children: ReactNode;
}) {
  const location = useLocation();
  const isClass = type === "class_result";
  return <EditorBoundary key={location.pathname} label={isClass ? "班級" : "活動"} listPath={isClass ? "/class-results" : "/activities"}>
    {children}
  </EditorBoundary>;
}
