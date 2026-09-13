import { one } from './db.js';
const at = one("SELECT updated_at FROM heartbeats WHERE name='worker'")?.updated_at || 0;
process.exit(at > Date.now() - 30000 ? 0 : 1);
