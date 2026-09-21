import * as esbuild from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'src');
const dist = resolve(root, 'dist');
const watch = process.argv.includes('--watch');
const dev = watch || process.argv.includes('--dev');

const shared = {
  bundle: true,
  target: ['chrome116'],
  sourcemap: dev ? 'inline' : false,
  minify: !dev,
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
};

/** Static assets copied verbatim into dist/. */
const assets = [
  ['manifest.json', 'manifest.json'],
  ['sidepanel/index.html', 'sidepanel/index.html'],
  ['sidepanel/styles.css', 'sidepanel/styles.css'],
  ['schema/candidate-profile.schema.json', 'schema/candidate-profile.schema.json'],
];

async function copyAssets() {
  for (const [from, to] of assets) {
    const target = resolve(dist, to);
    await mkdir(dirname(target), { recursive: true });
    await cp(resolve(src, from), target);
  }
}

/** Content script must be an IIFE — it runs in the page, not as a module. */
const configs = [
  {
    ...shared,
    entryPoints: { 'background/service-worker': resolve(src, 'background/service-worker.ts') },
    outdir: dist,
    format: 'esm',
  },
  {
    ...shared,
    entryPoints: { 'content/index': resolve(src, 'content/index.ts'), 'content/page-write': resolve(src, 'content/page-write.ts') },
    outdir: dist,
    format: 'iife',
  },
  {
    ...shared,
    entryPoints: { 'sidepanel/index': resolve(src, 'sidepanel/index.tsx') },
    outdir: dist,
    format: 'iife',
    jsx: 'automatic',
    loader: { '.json': 'json' },
  },
];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

if (watch) {
  const contexts = await Promise.all(configs.map((c) => esbuild.context(c)));
  await Promise.all(contexts.map((c) => c.watch()));
  await copyAssets();
  console.log('[build] watching…');
} else {
  await Promise.all(configs.map((c) => esbuild.build(c)));
  await copyAssets();
  console.log('[build] dist/ ready');
}
