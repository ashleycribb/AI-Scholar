#!/usr/bin/env node
// Fails if built HTML/CSS loads a script, stylesheet or font from another origin.
// Checks <script src>, <link href> (stylesheet/preload/modulepreload/font), CSS @import url() and CSS url() for fonts.
// Usage: node scripts/check-no-cdn.mjs [dir ...]   (defaults: dist dist-extension)
import fs from 'node:fs';
import path from 'node:path';

const EXTERNAL = /^(https?:)?\/\//i;

export function findExternalAssets(text, kind) {
  const hits = [];
  if (kind === 'html') {
    for (const m of text.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) if (EXTERNAL.test(m[1])) hits.push(`script ${m[1]}`);
    for (const m of text.matchAll(/<link\b[^>]*>/gi)) {
      const tag = m[0];
      const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
      const rel = /\brel\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? '';
      if (href && EXTERNAL.test(href) && /stylesheet|preload|modulepreload|font|preconnect/i.test(rel)) hits.push(`link[${rel}] ${href}`);
    }
    for (const m of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) hits.push(...findExternalAssets(m[1], 'css'));
  } else {
    for (const m of text.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/gi)) if (EXTERNAL.test(m[1])) hits.push(`@import ${m[1]}`);
    const withoutImports = text.replace(/@import[^;]*;?/gi, '');
    for (const m of withoutImports.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) if (EXTERNAL.test(m[1])) hits.push(`url() ${m[1]}`);
  }
  return hits;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

export function checkDirs(dirs) {
  const problems = [];
  let checked = 0;
  for (const d of dirs) {
    if (!fs.existsSync(d)) { problems.push(`${d}: missing (run the build first)`); continue; }
    for (const f of walk(d)) {
      const kind = f.endsWith('.html') ? 'html' : f.endsWith('.css') ? 'css' : null;
      if (!kind) continue;
      checked++;
      for (const h of findExternalAssets(fs.readFileSync(f, 'utf8'), kind)) problems.push(`${f}: ${h}`);
    }
  }
  return { problems, checked };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ['dist', 'dist-extension'];
  const { problems, checked } = checkDirs(dirs);
  if (problems.length) {
    console.error(`External script/style/font URLs found:\n${problems.join('\n')}`);
    process.exit(1);
  }
  console.log(`No external script/style/font URLs in ${checked} HTML/CSS files under ${dirs.join(', ')}.`);
}
