// Loads a Vercel API handler as a plain script for the vm-based tests. Shared modules under
// api/_lib are inlined (they only use globals by design); other imports are stripped so each
// test can inject them into its vm context.
const fs = require('node:fs');
const path = require('node:path');

function libSource(name) {
  return fs.readFileSync(path.join('api', '_lib', name), 'utf8').replace(/^export /gm, '');
}

function loadApiSource(file) {
  const libs = [];
  let source = fs.readFileSync(file, 'utf8');
  source = source.replace(/^import \{[^}]*\} from '\.\/_lib\/([a-z-]+\.js)';\r?\n/gm, (_, name) => { libs.push(name); return ''; });
  source = source.replace(/^import .*$/gm, '');
  source = source.replace('export default async function handler', 'async function handler');
  return libs.map(libSource).join('\n') + '\n' + source;
}

module.exports = { loadApiSource, libSource };
