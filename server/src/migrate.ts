import path from 'node:path'
// 迁移在 db.ts 载入时执行，所以这里 import 它就够了
import './db'
import { SQLITE_PATH } from './env'

/**
 * 手动建库 / 补迁移。
 *
 * 服务启动时会自己跑一次迁移（见 db.ts），这个脚本是给「只想起库、不想起服务」
 * 或排查迁移问题时用的，跑完即可退出。
 */
console.log(`库文件 ${path.resolve(SQLITE_PATH)} 已是最新结构（迁移在 db.ts 载入时执行）`)
process.exit(0)
