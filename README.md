# How it works
Have a single tsconfig.json for server, client, and common.
Typecheck and transpile server, client, and common using tsc into ./dist.
Separately bundle the client using esbuild into ./dist/public without typechecking.

Environment variables are defined in .env and managed by the dotenv package. It is ignored by Git. Set NODE_ENV=production for production builds to enable esbuild's minify function as well as dead branch code elimination.

# Development
npm run dev

# Production
npm run clean
npm run build
npm run start
