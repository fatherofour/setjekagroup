// Copies the browser-side worker and WASM the drawing markup (pdf.js) and
// the model viewer (web-ifc) load at runtime into public/vendor, so they
// always match the installed versions. Runs after every npm install.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'vendor');
mkdirSync(out, { recursive: true });
for (const [from, to] of [
  ['node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'pdf.worker.min.mjs'],
  ['node_modules/web-ifc/web-ifc.wasm', 'web-ifc.wasm'],
]) {
  copyFileSync(join(root, from), join(out, to));
}
