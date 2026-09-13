import { Worker } from './worker.js';
const worker = new Worker();
worker.start();
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    void worker.stop().then(() => process.exit(0));
  });
