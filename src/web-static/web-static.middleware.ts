import { existsSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import type { NextFunction, Request, Response } from 'express';

/**
 * Serves the BusPoint web app (Next.js static export, `BusPointweb/out`) from the API server.
 *
 * - `/api/*` and `/socket.io/*` are left to Nest.
 * - `/login` → `login.html`, `/` → `index.html`, files with an extension are served as-is.
 * - Dynamic pages (`/routes/[id]`, `/trips/[id]`, `/super-admin/schools/[id]/*`) are exported once
 *   under the placeholder id `_`. Any path segment that has no matching file falls back to a `_`
 *   sibling, so `/routes/abc` → `routes/_.html` and its client-navigation payloads
 *   (`/routes/abc.txt`, `/routes/abc/__next.*.txt`) → the `_` copies. New `[id]` routes work
 *   without changes here.
 * - Unknown paths get `404.html` with status 404.
 */
const PLACEHOLDER = '_';
const PASS_THROUGH = /^\/(api|socket\.io)(\/|$)/;

const isFile = (p: string) => existsSync(p) && statSync(p).isFile();
const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();

/** Walks `segments` under `root`, substituting the placeholder for unknown segments. */
function resolveFile(root: string, segments: string[]): string | null {
  let dir = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const next = [segments[i], PLACEHOLDER].map((s) => join(dir, s)).find(isDir);
    if (!next) return null;
    dir = next;
  }
  const last = segments[segments.length - 1];
  const dot = last.lastIndexOf('.');
  const candidates =
    dot > 0
      ? [last, PLACEHOLDER + last.slice(dot)] // routes/abc.txt → routes/_.txt
      : [`${last}.html`, join(last, 'index.html'), `${PLACEHOLDER}.html`, join(PLACEHOLDER, 'index.html')];
  return candidates.map((c) => join(dir, c)).find(isFile) ?? null;
}

export function webStaticMiddleware(rootDir: string) {
  const root = resolve(rootDir);

  return (req: Request, res: Response, next: NextFunction) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || PASS_THROUGH.test(req.path)) return next();

    let segments: string[];
    try {
      segments = req.path.split('/').filter(Boolean).map(decodeURIComponent);
    } catch {
      return next(); // malformed escape
    }
    if (segments.some((s) => s === '..' || s.includes('/') || s.includes('\\') || s.includes('\0'))) {
      return res.status(400).end();
    }

    const file = segments.length === 0 ? join(root, 'index.html') : resolveFile(root, segments);
    if (file && (file === root || file.startsWith(root + sep))) {
      const immutable = req.path.startsWith('/_next/static/');
      return res.sendFile(file, {
        headers: { 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' },
      });
    }

    const notFound = join(root, '404.html');
    if (isFile(notFound)) return res.status(404).sendFile(notFound, { headers: { 'Cache-Control': 'no-cache' } });
    return next();
  };
}

/** Folder holding the exported site: `WEB_STATIC_DIR`, default `<cwd>/public`. */
export function webStaticDir(): string {
  return resolve(process.env.WEB_STATIC_DIR ?? join(process.cwd(), 'public'));
}

export function hasWebBuild(dir: string): boolean {
  return isFile(join(dir, 'index.html'));
}
