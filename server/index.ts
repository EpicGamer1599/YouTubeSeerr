import { app } from './app.js';
import { log } from './db.js';
const port = Number(process.env.PORT || 5056);
const server = app.listen(port, process.env.HOST || '0.0.0.0', () =>
  log('info', 'YouTubeSeerr listening on http://localhost:' + port),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => server.close(() => process.exit(0)));
