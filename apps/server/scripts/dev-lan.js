const { spawn } = require('node:child_process');
const appRoot = require('node:path').resolve(__dirname, '..');
const tsNodeDevBin = require.resolve('ts-node-dev/lib/bin.js');

const child = spawn(
  process.execPath,
  [tsNodeDevBin, '--respawn', '--transpile-only', 'src/main.ts'],
  {
    cwd: appRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      HOST: '0.0.0.0',
    },
  },
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error('[dev:lan] Failed to start server:', error);
  process.exit(1);
});
