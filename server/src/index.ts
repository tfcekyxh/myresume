import express from 'express'
import { RESUME_MODULE_ORDER } from '@mymenu/shared'

const app = express()
const port = Number(process.env.PORT ?? 3000)

app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, modules: RESUME_MODULE_ORDER })
})

app.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`)
})
