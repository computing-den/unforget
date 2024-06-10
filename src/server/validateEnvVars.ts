const keys = [
  'PORT',
  'NODE_ENV',
  'DISABLE_CACHE',
  'LOG_TO_CONSOLE',
  'FORWARD_LOGS_TO_SERVER',
  'FORWARD_ERRORS_TO_SERVER',
] as const;

type KeyType = (typeof keys)[number];

declare global {
  namespace NodeJS {
    interface ProcessEnv extends Record<KeyType, string> {}
  }
}

for (const key of keys) {
  if (!process.env[key])
    throw new Error(
      `The environment variable ${key} is missing. Consider using a .env file at the root of the project.`,
    );
}
