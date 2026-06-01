const path = require('node:path');
const Module = require('node:module');

const webRoot = path.resolve(__dirname, '..');
const originalResolveFilename = Module._resolveFilename;
const webParent = {
  id: path.join(webRoot, 'package.json'),
  filename: path.join(webRoot, 'package.json'),
  paths: Module._nodeModulePaths(webRoot),
};

function resolveFromWeb(request) {
  return originalResolveFilename.call(Module, request, webParent, false);
}

if (!globalThis.__zyncWebReact18RequireHook) {
  globalThis.__zyncWebReact18RequireHook = true;

  Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
    if (request === 'react' || request.startsWith('react/')) {
      return resolveFromWeb(request);
    }

    if (request === 'react-dom' || request.startsWith('react-dom/')) {
      return resolveFromWeb(request);
    }

    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
}
