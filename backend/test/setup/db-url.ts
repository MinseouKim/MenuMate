import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const testDbFile = path.join(backendDir, 'data', 'test.db');
export const testDbUrl = `file:${testDbFile.split(path.sep).join('/')}`;
