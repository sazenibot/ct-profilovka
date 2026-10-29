import { cpSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const TEMPLATE = resolve('templates/profilovka/profilovka.html');
const MOCK_COUNT_URL = '/api/profilovka/stazeni/';

// Minimal stand-in for the Django template engine, so the dev page uses the
// exact same markup the Wagtail site will include. Supports only the tags the
// partial actually uses.
function renderDjangoPartial({ staticPrefix, countUrl }) {
  const context = { count_url: countUrl, csrf_token: countUrl ? 'dev-csrf-token' : '' };
  return readFileSync(TEMPLATE, 'utf8')
    .replace(/\{#[\s\S]*?#\}/g, '')
    .replace(/\{%\s*comment\s*%\}[\s\S]*?\{%\s*endcomment\s*%\}/g, '')
    .replace(/\{%\s*load [^%]*%\}/g, '')
    .replace(/\{%\s*url [^%]*%\}/g, '')
    .replace(/\{%\s*static\s+['"]([^'"]+)['"]\s*%\}/g, `${staticPrefix}$1`)
    .replace(/\{\{\s*(\w+)\s*(\|[^}]*)?\}\}/g, (_, name) => context[name] ?? '');
}

function profilovkaDev() {
  const counts = {};
  let isBuild = false;
  let outDir = 'dist';
  return {
    name: 'profilovka-dev',
    configResolved(config) {
      isBuild = config.command === 'build';
      outDir = resolve(config.root, config.build.outDir);
    },
    // Runs after Vite's own HTML processing, so the injected classic scripts and
    // static URLs stay exactly as they would in Django (static/ is copied as-is).
    // The static build has no backend: an empty count URL makes the JS skip the POST.
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const partial = isBuild
          ? renderDjangoPartial({ staticPrefix: './static/', countUrl: '' })
          : renderDjangoPartial({ staticPrefix: '/static/', countUrl: MOCK_COUNT_URL });
        return html.replace('<!-- profilovka:include -->', partial);
      },
    },
    writeBundle() {
      cpSync(resolve('static'), resolve(outDir, 'static'), { recursive: true });
    },
    handleHotUpdate({ file, server }) {
      if (file === TEMPLATE) server.ws.send({ type: 'full-reload' });
    },
    configureServer(server) {
      server.middlewares.use(MOCK_COUNT_URL, (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end();
        }
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          let frame = '';
          try {
            frame = String(JSON.parse(body).frame || '');
          } catch {
            /* ignore malformed body */
          }
          if (!/^[a-z0-9-]{1,64}$/.test(frame)) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ ok: false }));
          }
          counts[frame] = (counts[frame] || 0) + 1;
          console.log(`[mock] stažení rámečku "${frame}" → ${counts[frame]}×`);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, frame, count: counts[frame] }));
        });
      });
    },
  };
}

export default defineConfig({
  // Relative base works under any GitHub Pages subpath; override with BASE_PATH=/repo/ if needed.
  base: process.env.BASE_PATH || './',
  publicDir: false,
  plugins: [profilovkaDev()],
});
