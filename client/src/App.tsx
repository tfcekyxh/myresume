import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from '@/components/require-auth'
import { ResumeGate } from '@/components/resume-gate'
import { EditPage } from '@/pages/edit'
import { LoginPage } from '@/pages/login'
import { PreviewPage } from '@/pages/preview'
import { VersionsPage } from '@/pages/versions'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        {/* 取到简历后才渲染页面，页面里统一从 ResumeGate 的 context 拿 resume id */}
        <Route element={<ResumeGate />}>
          <Route path="/edit" element={<EditPage />} />
          <Route path="/versions" element={<VersionsPage />} />
          <Route path="/preview" element={<PreviewPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/edit" replace />} />
    </Routes>
  )
}
