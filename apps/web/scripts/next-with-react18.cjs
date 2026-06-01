#!/usr/bin/env node

const path = require('node:path');

const webRoot = path.resolve(__dirname, '..');
const hookPath = path.join(__dirname, 'react18-require-hook.cjs');
// IMPORTANT (Windows): NODE_OPTIONS is space-delimited. If we put an absolute path that
// contains spaces (e.g. C:/Users/QUANG MINH/...), Node will split it and preload fails.
// Using a relative path avoids this while still working for child Node processes.
const hookRelPath = path
  .relative(process.cwd(), hookPath)
  .replace(/\\/g, '/');
const hookRelSpecifier = hookRelPath.startsWith('.') || hookRelPath.startsWith('/')
  ? hookRelPath
  : `./${hookRelPath}`;
const hookOption = `--require=${hookRelSpecifier}`;

if (!process.env.NODE_OPTIONS?.includes(hookOption)) {
  const existing = process.env.NODE_OPTIONS ? process.env.NODE_OPTIONS.trim() : '';
  // Best-effort: remove any previous react18 hook requires (quoted or unquoted) to avoid
  // duplicates or broken absolute paths lingering in child processes.
  const cleaned = existing
    .replace(/(?:^|\s)--require=(?:"[^"]*react18-require-hook\.cjs"|'[^']*react18-require-hook\.cjs'|[^\s]*react18-require-hook\.cjs)(?=\s|$)/g, '')
    .trim();
  process.env.NODE_OPTIONS = cleaned ? `${cleaned} ${hookOption}` : hookOption;
}

require(hookPath);

const nextBin = require.resolve('next/dist/bin/next', { paths: [webRoot] });
process.argv = [process.argv[0], nextBin, ...process.argv.slice(2)];
require(nextBin);
