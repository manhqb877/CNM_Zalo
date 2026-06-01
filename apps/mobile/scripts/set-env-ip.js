const { networkInterfaces } = require('os');
const fs = require('fs');
const path = require('path');

const nets = networkInterfaces();
let localIp = '127.0.0.1';

for (const name of Object.keys(nets)) {
  for (const net of nets[name]) {
    // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
    if (net.family === 'IPv4' && !net.internal) {
      const lowerName = name.toLowerCase();
      
      // Skip virtual/WSL adapters
      if (lowerName.includes('wsl') || lowerName.includes('virtual') || lowerName.includes('vethernet')) {
        continue;
      }

      // Prioritize Wi-Fi and Ethernet over virtual adapters (like Docker or WSL)
      if (lowerName.includes('wi-fi') || lowerName.includes('wifi') || lowerName.includes('wireless') || lowerName.includes('ethernet') || lowerName.includes('en0') || lowerName.includes('eth0')) {
        localIp = net.address;
        // Break inner loop, keep checking outer loop if we find a better one
      } else if (localIp === '127.0.0.1') {
        localIp = net.address;
      }
    }
  }
}

const envPath = path.join(__dirname, '..', '.env');
let envContent = '';

if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
}

let modified = false;

// Update or add EXPO_PUBLIC_API_URL
if (envContent.includes('EXPO_PUBLIC_API_URL=')) {
  envContent = envContent.replace(/EXPO_PUBLIC_API_URL=.*/g, `EXPO_PUBLIC_API_URL=http://${localIp}:3000/api`);
  modified = true;
} else {
  envContent += `\nEXPO_PUBLIC_API_URL=http://${localIp}:3000/api\n`;
  modified = true;
}

// Update or add EXPO_PUBLIC_SOCKET_URL
if (envContent.includes('EXPO_PUBLIC_SOCKET_URL=')) {
  envContent = envContent.replace(/EXPO_PUBLIC_SOCKET_URL=.*/g, `EXPO_PUBLIC_SOCKET_URL=http://${localIp}:3000`);
  modified = true;
} else {
  envContent += `\nEXPO_PUBLIC_SOCKET_URL=http://${localIp}:3000\n`;
  modified = true;
}

if (modified) {
  // ensure no leading/trailing blank lines more than needed
  fs.writeFileSync(envPath, envContent.trim() + '\n');
  console.log(`[Zync Setup] Injected Local IP (${localIp}) into apps/mobile/.env!`);
} else {
  console.log(`[Zync Setup] .env is already configured for Local IP (${localIp}).`);
}
