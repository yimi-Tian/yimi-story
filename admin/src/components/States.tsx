export function LoadingState({ label = "資料載入中" }: { label?: string }) {
  return <div className="state-panel" role="status"><span className="spinner" aria-hidden="true" />{label}…</div>;
}

export function ErrorState({ message }: { message: string }) {
  return <div className="state-panel state-panel--error" role="alert">{message}</div>;
}

export function EmptyState({ message }: { message: string }) {
  return <div className="state-panel">{message}</div>;
}
