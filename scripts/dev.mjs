import { spawn } from 'node:child_process';

const children = [
  spawn(process.execPath, ['server/api.mjs'], { stdio: 'inherit', env: process.env }),
  spawn(process.execPath, ['frontend/server.mjs'], { stdio: 'inherit', env: process.env }),
];

process.on('SIGINT', () => { children.forEach((child) => child.kill('SIGINT')); });
process.on('SIGTERM', () => { children.forEach((child) => child.kill('SIGTERM')); });
