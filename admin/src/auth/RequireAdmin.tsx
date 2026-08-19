import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { LoadingState } from "../components/States";

export function RequireAdmin() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <LoadingState label="正在確認後台權限" />;
  if (status === "authenticated") return <Outlet />;
  return <Navigate to="/login" replace state={{ from: location.pathname, reason: status }} />;
}
