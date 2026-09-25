import seedDemo from './seed-demo'

/**
 * `bun run demo:seed` 的入口。
 *
 * 单独放一个文件是因为 seed-demo 同时被 Playwright 的 globalSetup 加载，
 * 而 Playwright 把它当 CJS 读，那里不能用 import.meta 判直接执行。
 */
await seedDemo()