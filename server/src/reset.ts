// Deletes the database so the app starts fresh with only the sample library.
import { rmSync } from 'node:fs';
import { config } from './config.ts';

for (const suffix of ['', '-wal', '-shm']) rmSync(config.dbFile + suffix, { force: true });
console.log('Database deleted. Run "npm run dev" to start fresh.');
