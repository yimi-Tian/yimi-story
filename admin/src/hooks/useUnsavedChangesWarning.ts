import { useEffect } from "react";
import { useBeforeUnload } from "react-router-dom";

export const unsavedChangesMessage = "尚有未儲存的變更，確定要離開嗎？";

export function useUnsavedChangesWarning(dirty: boolean) {
  useBeforeUnload((event: BeforeUnloadEvent) => {
    if (dirty) event.preventDefault();
  });

  useEffect(() => {
    if (!dirty) return;
    const confirmInternalNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.target === "_blank" || target.hasAttribute("download")) return;
      const destination = new URL(target.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.href === window.location.href) return;
      if (!window.confirm(unsavedChangesMessage)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    document.addEventListener("click", confirmInternalNavigation, true);
    return () => document.removeEventListener("click", confirmInternalNavigation, true);
  }, [dirty]);
}
