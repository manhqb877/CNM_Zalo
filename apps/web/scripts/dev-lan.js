const os = require('node:os');
const { spawn } = require('node:child_process');

const PORT = process.env.PORT || '3001';

function resolveLanIpv4() {
  const interfaces = os.networkInterfaces();

  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;

    for (const entry of entries) {
      if (!entry) continue;

      const isIpv4 = entry.family === 'IPv4' || entry.family === 4;
      if (!isIpv4 || entry.internal) continue;

      const ip = entry.address;
      if (ip.startsWith('192.168.') || ip.startsWith('10.') || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) {
        return ip;
      }
    }
  }

  return null;
}

const lanIp = resolveLanIpv4();

console.log(`[web:lan] Local:   http://localhost:${PORT}`);
if (lanIp) {
  console.log(`[web:lan] LAN:     http://${lanIp}:${PORT}`);
} else {
  console.log(`[web:lan] LAN IP not found automatically. Use 'ipconfig' and open http://<your-ip>:${PORT}`);
}

const nextBin = require.resolve('./next-with-react18.cjs');
const child = spawn(
  process.execPath,
  [nextBin, 'dev', '--hostname', '0.0.0.0', '--port', PORT],
  {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      NEXT_PUBLIC_LAN_DEMO_WARN: 'true',
    },
  },
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error('[web:lan] Failed to start Next.js:', error);
  process.exit(1);
});
