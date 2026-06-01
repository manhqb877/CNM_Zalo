const fs = require('fs'); const path = 'apps/web/src/components/home-dashboard/molecules/message-item.tsx'; let content = fs.readFileSync(path, 'utf8'); console.log(content.length);
