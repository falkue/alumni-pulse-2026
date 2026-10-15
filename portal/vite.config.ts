// Vite-Konfiguration für das lokale Portal.
// - React-Plugin für JSX/Fast Refresh
// - localAggregates: liefert im Dev-Server die (synthetischen) Aggregat-Dateien
//   der Pipeline aus ../data/processed/aggregates aus – je Anfrage genau EINE Datei
// - Vitest läuft in jsdom (simuliertes Browser-DOM inkl. localStorage)
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** Ordner mit den KI-Interpretationen (Prototyp, portal/insights/<chartId>/texts/<id>.json). */
const INSIGHTS_DIR = path.resolve(import.meta.dirname, 'insights');

/** Ordner mit den Aggregaten der Pipeline (nur synthetische Daten, siehe docs/data_governance.md). */
const AGGREGATES_DIR = path.resolve(import.meta.dirname, '../data/processed/aggregates');

/**
 * Dev-Server-Middleware: GET /local-aggregates/<schools|waves_mock>/<S001|ALL>.json
 * Strenges Muster -> keine anderen Dateien/Ordner erreichbar. Keine Listen-Ansicht.
 * Hinweis: Das ist nur für die lokale Demo. In Firebase prüfen die Rules den Zugriff.
 */
function localAggregates(): Plugin {
  return {
    name: 'local-aggregates',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // Erlaubt: S001 … S999 und die gepoolte Demo-Sicht ALL
        // KI-Interpretationen: GET /local-insights/<chartId>/<S001|ALL>.json
        const ins = /^\/local-insights\/([a-z_]+)\/(S\d{3}|ALL)\.json$/.exec(req.url ?? '');
        if (ins) {
          try {
            const body = await readFile(path.join(INSIGHTS_DIR, ins[1], 'texts', `${ins[2]}.json`), 'utf8');
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(body);
          } catch {
            res.statusCode = 404;
            res.end('{"error":"not-found"}');
          }
          return;
        }
        const match = /^\/local-aggregates\/(schools|waves_mock)\/(S\d{3}|ALL)\.json$/.exec(req.url ?? '');
        if (!match) return next();
        try {
          const body = await readFile(path.join(AGGREGATES_DIR, match[1], `${match[2]}.json`), 'utf8');
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(body);
        } catch {
          res.statusCode = 404;
          res.end('{"error":"not-found"}');
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localAggregates()],
  server: { port: 5174, strictPort: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
