// 记录「最近编辑的简历」，登录后默认跳回它，省得每次重新选。
// 只存 id，不存数据；用 localStorage 即可，无需后端参与。
// 按用户名分开存：同一浏览器换账号登录时不会串到别人的简历上。

const key = (username: string) => `last-resume-id:${username}`

export function rememberLastResume(username: string, resumeId: string) {
  try {
    localStorage.setItem(key(username), resumeId)
  } catch {
    // 隐私模式或禁用存储时静默忽略
  }
}

/** 删除某份简历时，若它正是记录里的那份，则清掉记录。 */
export function forgetLastResume(username: string, resumeId: string) {
  try {
    if (localStorage.getItem(key(username)) === resumeId) {
      localStorage.removeItem(key(username))
    }
  } catch {
    // ignore
  }
}

/** 登录后的默认入口：有最近编辑记录则回编辑页，否则进简历列表。 */
export function lastResumeEditTarget(username: string): string {
  try {
    const id = localStorage.getItem(key(username))
    return id ? `/resumes/${id}/edit` : '/resumes'
  } catch {
    return '/resumes'
  }
}
