import { useEffect, useState } from 'react'
import { RESUME_MODULE_ORDER } from '@mymenu/shared'

function App() {
  const [status, setStatus] = useState('检测中…')

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setStatus(data.ok ? '后端连接正常' : '后端返回异常'))
      .catch(() => setStatus('后端未连接'))
  }, [])

  return (
    <main>
      <h1>简历</h1>
      <p>{status}</p>
      <p>模块：{RESUME_MODULE_ORDER.join(' / ')}</p>
    </main>
  )
}

export default App
