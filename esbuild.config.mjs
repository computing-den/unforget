import 'dotenv/config';
import esbuild from 'esbuild';

const context = await esbuild.context({
  entryPoints: ['src/client/index.tsx', 'src/client/style.css', 'src/client/serviceWorker.ts'],
  outdir: 'dist/public',
  minify: process.env.NODE_ENV === 'production',
  bundle: true,
  sourcemap: true,
  format: 'esm',
  treeShaking: true,
  define: Object.fromEntries(Object.keys(process.env).map(key => [`process.env.${key}`, `"${process.env[key]}"`])),
  plugins: [reporterPlugin()],
  loader: { '.svg': 'dataurl', '.txt': 'text' },
});

if (process.argv.includes('--watch')) {
  console.log('Watching ...');
  await context.watch();
} else {
  console.log('Building ...');
  await context.rebuild();
  await context.dispose();
}

function reporterPlugin() {
  return {
    name: 'reporter',
    setup(build) {
      build.onEnd(result => console.log(`Done - ${result.errors.length} errors, ${result.warnings.length} warnings`));
    },
  };
}
