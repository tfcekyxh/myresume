import type { ResumeData } from '@mymenu/shared'

/**
 * 录制演示用的示例简历。
 *
 * 内容要「像真的」：各模块都有条目、要点有多条，拖拽排序与要点编号重排
 * 才有东西可演示。这份数据既用于 seed 脚本写草稿，也作为片段 4 存档时的内容。
 */
export const demoResumeData: ResumeData = {
  basic: {
    name: '张伟',
    intention: '前端工程师',
    gender: '男',
    age: '28',
    phone: '13800138000',
    email: 'zhangwei@example.com',
  },
  education: [
    {
      school: '华中科技大学',
      degree: '硕士',
      major: '计算机科学与技术',
      period: '2018.09 - 2021.06',
    },
    {
      school: '武汉理工大学',
      degree: '本科',
      major: '软件工程',
      period: '2014.09 - 2018.06',
    },
  ],
  skills: [
    { text: '熟练使用 TypeScript / React，有大型前端项目的架构与性能优化经验' },
    { text: '熟悉 Vite / Webpack 构建体系，能独立完成工程化改造与构建提速' },
    { text: '熟悉 Node.js 与 Express，能承担 BFF 与中小型服务端开发' },
    { text: '熟悉 Playwright / Vitest，推动过团队从零搭建端到端测试体系' },
  ],
  work: [
    {
      company: '云启科技有限公司',
      role: '高级前端工程师',
      period: '2021.07 - 至今',
      summary: '负责企业级 SaaS 控制台的前端架构与团队工程效率建设。',
      points: [
        '主导控制台前端架构升级，把首屏加载从 4.2s 压到 1.3s，留存提升 12%',
        '搭建团队内部组件库与文档站，覆盖 40+ 业务组件，新页面开发提速约 30%',
        '推动端到端测试落地，核心链路用例覆盖率从 0 提升到 78%',
      ],
    },
  ],
  internship: [
    {
      company: '启明网络技术有限公司',
      role: '前端开发实习生',
      period: '2020.07 - 2020.12',
      points: ['参与后台管理系统开发，独立完成权限配置与数据看板两个模块'],
    },
  ],
  projects: [
    {
      name: '简历排版与导出系统',
      type: '全栈项目',
      period: '2023.03 - 2023.09',
      description: '面向求职者的一站式简历编辑与导出工具，支持草稿自动保存、版本存档与多格式导出。',
      techStack: 'React 19 / TypeScript / Express / PostgreSQL / PDFKit',
      points: [
        '设计「草稿为唯一工作区、版本为只读快照」的数据模型，避免编辑冲突',
        '服务端内嵌中文字体直接绘制 PDF，解决导出产物跨机器排版不一致的问题',
      ],
    },
    {
      name: '开源表格组件 GridLite',
      type: '开源项目',
      period: '2022.05 - 2022.11',
      description: '一个轻量的虚拟滚动表格组件，解决万级数据下的渲染卡顿。',
      techStack: 'TypeScript / React / Rollup',
      points: ['用虚拟滚动 + 分片渲染把一万行数据的滚动帧率稳定在 60fps'],
    },
  ],
  footer: '以上内容真实有效，可提供相关证明材料。',
}

/**
 * 预置的历史版本快照。
 *
 * 刻意是一份「更早的修订版」：求职意向不同、少了教育/技能/项目各一条。
 * 这样片段 4 里「恢复」之后表单内容会明显变样，看得见覆盖确实发生了；
 * 同时当前草稿与它不一致，列表首条会显示「未存档」，
 * 点存档后徽标变成「已存档」，整段有个完整的弧线。
 */
export const seededVersionSnapshot: ResumeData = {
  ...demoResumeData,
  basic: { ...demoResumeData.basic, intention: '前端开发工程师' },
  education: demoResumeData.education.slice(0, 1),
  skills: demoResumeData.skills.slice(0, 2),
  projects: demoResumeData.projects.slice(0, 1),
  footer: '以上内容真实有效。',
}