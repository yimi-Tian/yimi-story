import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAdmin } from "./auth/RequireAdmin";
import { AdminLayout } from "./app/AdminLayout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { UpdatePasswordPage } from "./pages/UpdatePasswordPage";
import { ContentListPage } from "./components/content/ContentListPage";
import { ContentEditorPage } from "./components/content/ContentEditorPage";
import { ContentEditorBoundary } from "./components/content/ContentEditorBoundary";
import { DraftPreviewPage } from "./components/preview/DraftPreviewPage";
import { PreviewBoundary } from "./components/preview/PreviewBoundary";

export function App() {
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
    <Route path="/update-password" element={<UpdatePasswordPage />} />
    <Route element={<RequireAdmin />}>
      <Route element={<AdminLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/class-results" element={<ContentListPage type="class_result" />} />
        <Route path="/class-results/new" element={<ContentEditorBoundary type="class_result"><ContentEditorPage type="class_result" isNew /></ContentEditorBoundary>} />
        <Route path="/class-results/:publicId/preview" element={<PreviewBoundary type="class_result"><DraftPreviewPage type="class_result" /></PreviewBoundary>} />
        <Route path="/class-results/:publicId" element={<ContentEditorBoundary type="class_result"><ContentEditorPage type="class_result" /></ContentEditorBoundary>} />
        <Route path="/activities" element={<ContentListPage type="activity" />} />
        <Route path="/activities/new" element={<ContentEditorBoundary type="activity"><ContentEditorPage type="activity" isNew /></ContentEditorBoundary>} />
        <Route path="/activities/:publicId/preview" element={<PreviewBoundary type="activity"><DraftPreviewPage type="activity" /></PreviewBoundary>} />
        <Route path="/activities/:publicId" element={<ContentEditorBoundary type="activity"><ContentEditorPage type="activity" /></ContentEditorBoundary>} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes>;
}
