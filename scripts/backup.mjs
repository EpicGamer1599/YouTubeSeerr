import { DatabaseSync } from 'node:sqlite';
import { mkdir, copyFile, readdir, chmod } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
const source = resolve(process.env.CONFIG_DIR || './config');
const destination = process.argv[2] ? resolve(process.argv[2]) : null;
if (!destination) throw new Error('Usage: npm run backup -- /absolute/backup/directory');
const rel = relative(source, destination);
if (!rel || (!rel.startsWith('..') && !isAbsolute(rel)))
  throw new Error('Choose a backup directory outside the config directory.');
await mkdir(destination, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(resolve(source, 'youtubeseerr.db'), { readOnly: true });
try {
  db.prepare('VACUUM INTO ?').run(resolve(destination, 'youtubeseerr.db'));
  await chmod(resolve(destination, 'youtubeseerr.db'), 0o600);
  await copyFile(resolve(source, 'secret.key'), resolve(destination, 'secret.key'));
  await chmod(resolve(destination, 'secret.key'), 0o600);
  for (const name of await readdir(source))
    if (name.endsWith('-cookies.txt')) {
      await copyFile(resolve(source, name), resolve(destination, name));
      await chmod(resolve(destination, name), 0o600);
    }
  console.log('Database and encryption key backed up successfully.');
} finally {
  db.close();
}
