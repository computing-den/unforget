# How it works
Have a single tsconfig.json for server, client, and common.
Typecheck and transpile server, client, and common using tsc into ./dist.
Separately bundle the client using esbuild into ./dist/public without typechecking.

# Development
npm run dev

# Production
npm run clean
npm run build
npm run start
