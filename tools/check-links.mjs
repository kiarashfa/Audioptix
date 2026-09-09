// tools/check-links.mjs
// Walks every page plus the manifest and confirms each internal reference
// resolves to a file that exists, and that each absolute URL pointing at this
// site maps to one too. Catches renamed assets, typos, and base-path mistakes.
//
// The site deploys under /audioptix/, so absolute site URLs have that base
// stripped before they are mapped back to a file on disk. Without that step
// every link would look broken and the report would be worthless.

import { readdir, readFile, access } from 'node:fs/promises';
import { join, posix } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const ORIGIN = 'https://kiarashfa.github.io';
const BASE = '/audioptix/';

const exists = (rel) => access(join(ROOT, rel)).then(() => true, () => false);

// Attributes worth following, plus the meta tags that carry asset URLs.
const PATTERNS = [
  /\b(?:href|src)\s*=\s*"([^"]+)"/gi,
  /<meta[^>]+(?:property|name)="(?:og:image|twitter:image)"[^>]+content="([^"]+)"/gi,
];

function candidates(text) {
  const out = new Set();
  for (const re of PATTERNS) {
    for (const m of text.matchAll(re)) out.add(m[1].trim());
  }
  return [...out];
}

/** Map a URL as it appears in a page to a repo-relative file path, or null to skip. */
function toFile(url, pageBase) {
  if (/^(?:data:|mailto:|tel:|#|javascript:)/i.test(url)) return null;
  if (/^https?:\/\//i.test(url)) {
    if (!url.startsWith(ORIGIN)) return null;           // genuinely external
    let path = url.slice(ORIGIN.length);
    if (!path.startsWith(BASE)) return { rel: null, why: `absolute URL misses the base path ${BASE}` };
    path = path.slice(BASE.length);
    return { rel: path === '' ? 'index.html' : path };
  }
  if (url.startsWith('/')) return { rel: null, why: 'root-absolute path breaks under the base path' };
  let rel = posix.normalize(posix.join(pageBase, url)).replace(/^\.\//, '');
  if (rel === '' || rel === '.') rel = 'index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  return { rel };
}

const pages = (await readdir(ROOT, { withFileTypes: true }))
  .filter((e) => e.isFile() && e.name.endsWith('.html'))
  .map((e) => e.name)
  .sort();

let checked = 0;
const problems = [];

for (const page of [...pages, 'site.webmanifest', 'robots.txt', 'sitemap.xml', 'music/tracks.json']) {
  if (!(await exists(page))) { problems.push([page, page, 'file is referenced by the build but missing']); continue; }
  const text = await readFile(join(ROOT, page), 'utf8');

  // A <base> tag reroots every relative URL on that page.
  const hasBase = /<base\s+href="([^"]+)"/i.exec(text);
  const pageBase = hasBase ? '.' : posix.dirname(page) === '.' ? '.' : posix.dirname(page);

  let urls = candidates(text);
  // The <base> href is root-absolute by design; it is what makes the rest relative.
  if (hasBase) urls = urls.filter((u) => u !== hasBase[1]);
  if (page === 'site.webmanifest') {
    const json = JSON.parse(text);
    urls = (json.icons || []).map((i) => i.src);
  } else if (page === 'music/tracks.json') {
    const json = JSON.parse(text);
    urls = (json.tracks || []).map((t) => 'music/' + t.file);
  } else if (page === 'robots.txt') {
    // Only the Sitemap directive is a real reference; the rest is commentary.
    urls = [...text.matchAll(/^\s*Sitemap:\s*(\S+)\s*$/gim)].map((m) => m[1]);
  } else if (page === 'sitemap.xml') {
    urls = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  }

  for (const url of urls) {
    const mapped = toFile(url, page === 'music/tracks.json' ? '.' : pageBase);
    if (!mapped) continue;
    checked++;
    if (!mapped.rel) { problems.push([page, url, mapped.why]); continue; }
    if (!(await exists(mapped.rel))) problems.push([page, url, `no such file: ${mapped.rel}`]);
  }
}

console.log(`Checked ${checked} internal reference(s) across ${pages.length} page(s) + manifest/robots/sitemap/tracks.`);
if (problems.length) {
  console.error(`\n${problems.length} broken reference(s):`);
  for (const [where, url, why] of problems) console.error(`  ${where}: ${url}\n      ${why}`);
  process.exit(1);
}
console.log('All internal references resolve.');
