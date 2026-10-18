import { GlobalRegistrator } from '@happy-dom/global-registrator'

// 组件测试跑在 Bun 里，没有浏览器环境；happy-dom 补上 window / document 等全局对象，
// 供 @testing-library/react 渲染与查询。由 bunfig.toml 的 [test] preload 加载。
GlobalRegistrator.register()
