import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAdmin } from '@/components/require-admin'
import { RequireAuth } from '@/components/require-auth'
import { ResumeGate } from '@/components/resume-gate'
import { AdminPage } from '@/pages/admin'
import { EditPage } from '@/pages/edit'
import { LoginPage } from '@/pages/login'
import { ResumeListPage } from '@/pages/resumes'
import { VersionsPage } from '@/pages/versions'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        {/* 登录后先选简历，再进入某一份的具体页面 */}
        <Route path="/resumes" element={<ResumeListPage />} />
        <Route path="/resumes/:resumeId" element={<ResumeGate />}>
          <Route path="edit" element={<EditPage />} />
          <Route path="versions" element={<VersionsPage />} />
        </Route>
        {/* 数据备份只有管理员进得来，其他人会被弹回简历列表 */}
        <Route element={<RequireAdmin />}>
          <Route path="/admin" element={<AdminPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/resumes" replace />} />
    </Routes>
  )
}
