import { watch as rollupWatch } from 'rollup';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('=== Testing direct Rollup watch ===');

const watcher = rollupWatch({
  input: path.resolve(__dirname, 'src/index.ts'),
  watch: {
    include: 'src/**',
  },
  plugins: [{
    name: 'ts-noop',
    resolveId(source, importer) {
      if (!importer) return null;
      if (source.startsWith('.')) {
        const resolved = path.resolve(path.dirname(importer), source);
        // Try with .ts extension
        for (const ext of ['', '.ts', '.tsx', '/index.ts']) {
          const full = resolved + ext;
          if (fs.existsSync(full)) return full;
        }
      }
      return { id: source, external: true };
    },
    load(id) {
      if (fs.existsSync(id)) {
        return fs.readFileSync(id, 'utf8').replace(/import type .*/g, '// type import removed');
      }
      return null;
    }
  }],
});

watcher.on('event', (event) => {
  console.log('=== ROLLUP EVENT:', event.code, '===');
  if (event.result) event.result.close();
});

setTimeout(() => {
  const file = path.resolve(__dirname, 'src/types.ts');
  const content = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, content + '\n// direct test ' + Date.now());
  console.log('=== FILE MODIFIED ===');
}, 5000);

setTimeout(() => {
  console.log('=== TIMEOUT ===');
  watcher.close();
  process.exit(0);
}, 15000);
