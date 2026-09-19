import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from '@/components/require-auth'
import { EditPage } from '@/pages/edit'
import { LoginPage } from '@/pages/login'
import { PreviewPage } from '@/pages/preview'
import { VersionsPage } from '@/pages/versions'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/edit" element={<EditPage />} />
        <Route path="/versions" element={<VersionsPage />} />
        <Route path="/preview" element={<PreviewPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/edit" replace />} />
    </Routes>
  )
}
