import { afterEach, beforeEach, expect, mock, test } from 'bun:test'
import { createEmptyResumeData } from '@mymenu/shared'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ResumeRecord } from '@/lib/resume'
import type { VersionSummary } from '@/lib/versions'

/**
 * 版本页的组件测试（bun test + @testing-library/react + happy-dom）。
 *
 * 与 e2e 分层的分工：e2e 走真实浏览器与真实后端，验证「点下去真的发生什么」；
 * 这里不连网络、不起服务，用 React Testing Library 直接渲染组件、替身掉数据来源，
 * 专门覆盖靠肉眼与端到端都难穷举的**渲染分支**——空状态、备注占位、草稿条目的
 * 只读语义与标签、管理员按钮的有无、发送过程中的文案。窄屏排版这类观感问题仍归 e2e。
 *
 * 数据来源全部是 `lib/*` 里的 react-query hooks，所以这里用 `mock.module` 替掉这几个
 * 模块（而不是搭 QueryClient 去 mock fetch），断言只落在用户可见的文案与按钮上。
 */

/** 用例之间共享的可变状态：下面的替身 hooks 读它，用例改它。 */
const state = {
  versions: [] as VersionSummary[],
  isPending: false,
  isAdmin: false,
  /** 草稿最后保存时间 */
  updatedAt: '2026-10-18T08:47:00.000Z',
  /** 草稿最近一次被存档的时间；为 null 或早于 updatedAt 即视为有未存档改动 */
  lastArchivedAt: null as string | null,
  /** 挂起「发送到邮箱」的时机，用来断言过程中的「发送中…」 */
  emailPending: Promise.resolve(),
  emailError: null as Error | null,
  emailCalls: [] as string[],
  toasts: [] as string[],
}

mock.module('@/components/resume-gate', () => ({
  useResume: () => ({
    resumeId: 'resume-1',
    title: '后端简历',
    initialData: createEmptyResumeData(),
    photoId: null,
  }),
}))

mock.module('@/lib/resume', () => ({
  resumeKey: (resumeId: string) => ['resume', resumeId],
  useResumeDetail: () => ({
    data: {
      id: 'resume-1',
      title: '后端简历',
      data: createEmptyResumeData(),
      photoId: null,
      updatedAt: state.updatedAt,
      lastArchivedAt: state.lastArchivedAt,
    } satisfies ResumeRecord,
  }),
}))

mock.module('@/lib/photo', () => ({
  usePhoto: () => ({ data: undefined }),
}))

mock.module('@/lib/auth', () => ({
  useCurrentUser: () => ({
    data: { id: 'user-1', username: 'admin', isAdmin: state.isAdmin },
  }),
}))

mock.module('@/lib/versions', () => ({
  useVersions: () => ({ data: state.versions, isPending: state.isPending }),
  useVersion: () => ({ data: undefined, isPending: false }),
  useDeleteVersion: () => ({ mutateAsync: async () => ({ ok: true }), isPending: false }),
  useRestoreVersion: () => ({ mutateAsync: async () => ({ id: 'resume-1' }), isPending: false }),
  useEmailVersion: () => ({
    mutateAsync: async (versionId: string) => {
      state.emailCalls.push(versionId)
      await state.emailPending
      if (state.emailError) throw state.emailError
      return { ok: true, to: ['mail@example.com'] }
    },
  }),
}))
mock.module('sonner', () => ({
  toast: {
    success: (message: string) => state.toasts.push(message),
    error: (message: string) => state.toasts.push(message),
  },
}))

// mock 必须先注册再导入被测组件：静态 import 会被提升到注册之前，拿到的还是真实模块。
const { VersionsPage } = await import('@/pages/versions')

function renderVersionsPage() {
  return render(
    <MemoryRouter initialEntries={['/resumes/resume-1/versions']}>
      <VersionsPage />
    </MemoryRouter>
  )
}

/** 历史版本条目（带备注 note 的那条）。 */
function versionItem(note: string) {
  return screen.getByText(note).closest('li') as HTMLElement
}

/** 顶部固定那条「当前草稿」。 */
function draftItem() {
  return screen.getByText('当前草稿').closest('li') as HTMLElement
}

beforeEach(() => {
  state.versions = []
  state.isPending = false
  state.isAdmin = false
  state.updatedAt = '2026-10-18T08:47:00.000Z'
  state.lastArchivedAt = null
  state.emailPending = Promise.resolve()
  state.emailError = null
  state.emailCalls = []
  state.toasts = []
})

afterEach(() => {
  cleanup()
})

test('没有存档版本时显示空状态提示', () => {
  renderVersionsPage()

  expect(screen.queryByText(/还没有存档版本/)).not.toBeNull()
})

test('版本条目显示备注，无备注时显示占位文案', () => {
  state.versions = [
    { id: 'v1', note: '投递前端岗的版本', createdAt: '2026-10-18T08:56:00.000Z' },
    { id: 'v2', note: null, createdAt: '2026-10-18T09:10:00.000Z' },
  ]

  renderVersionsPage()

  expect(screen.queryByText('投递前端岗的版本')).not.toBeNull()
  expect(screen.queryByText('（无备注）')).not.toBeNull()
})

test('当前草稿条目只可查看，没有恢复按钮', () => {
  state.versions = [{ id: 'v1', note: '存档版本', createdAt: '2026-10-18T08:56:00.000Z' }]

  renderVersionsPage()

  // 恢复是历史版本才有的动作：全局只有一条，且不在草稿条目里
  expect(screen.getAllByRole('button', { name: '恢复' })).toHaveLength(1)
  expect(within(draftItem()).queryByRole('button', { name: '恢复' })).toBeNull()
  expect(within(draftItem()).queryByRole('button', { name: '查看' })).not.toBeNull()
})

test('草稿标签按是否晚于最近一次存档显示已存档/未存档', () => {
  // 存档之后没有改动
  state.lastArchivedAt = state.updatedAt
  renderVersionsPage()
  expect(within(draftItem()).getByTestId('draft-badge').textContent).toBe('已存档')

  // 存档之后又改过：updatedAt 晚于 lastArchivedAt
  cleanup()
  state.updatedAt = '2026-10-18T09:00:00.000Z'
  renderVersionsPage()
  expect(within(draftItem()).getByTestId('draft-badge').textContent).toBe('未存档')
})

test('只有管理员看得到「发送到邮箱」', () => {
  state.versions = [{ id: 'v1', note: '存档版本', createdAt: '2026-10-18T08:56:00.000Z' }]

  renderVersionsPage()
  expect(screen.queryByRole('button', { name: '发送到邮箱' })).toBeNull()

  cleanup()
  state.isAdmin = true
  renderVersionsPage()
  expect(within(versionItem('存档版本')).queryByRole('button', { name: '发送到邮箱' })).not.toBeNull()
})

test('发送到邮箱过程中显示发送中，结束后提示收件人或失败原因', async () => {
  state.isAdmin = true
  state.versions = [{ id: 'v1', note: '存档版本', createdAt: '2026-10-18T08:56:00.000Z' }]

  let release = () => {}
  state.emailPending = new Promise<void>((resolve) => {
    release = resolve
  })

  renderVersionsPage()
  fireEvent.click(screen.getByRole('button', { name: '发送到邮箱' }))

  // 请求挂起期间按钮进入「发送中…」，避免重复点
  expect(screen.queryByRole('button', { name: '发送中…' })).not.toBeNull()
  expect(state.emailCalls).toEqual(['v1'])

  release()
  await waitFor(() => expect(state.toasts).toEqual(['已发送到 mail@example.com']))

  // 失败时把原因提示出来，而不是静默
  cleanup()
  state.toasts = []
  state.emailError = new Error('boom')
  renderVersionsPage()
  fireEvent.click(screen.getByRole('button', { name: '发送到邮箱' }))
  await waitFor(() => expect(state.toasts).toEqual(['发送失败，请稍后重试']))
})
