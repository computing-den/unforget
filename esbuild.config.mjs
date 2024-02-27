import esbuild from 'esbuild';

const context = await esbuild.context({
  entryPoints: ['src/client/index.tsx', 'src/client/style.css', 'src/client/serviceWorker.ts'],
  outdir: 'dist/public',
  minify: true,
  bundle: true,
  sourcemap: true,
  format: 'esm',
});

if (process.argv.includes('--watch')) {
  console.log('Watching ...');
  await context.watch();
} else {
  console.log('Building ...');
  await context.rebuild();
}
