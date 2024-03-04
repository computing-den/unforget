import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import cp from 'node:child_process';

const deployName = process.argv[2];

readEnvVars();

const { DEPLOY_SSH_HOST, DEPLOY_BUILD_PATH, DEPLOY_PATH, DEPLOY_SERVICE } = process.env;

// Make archive.
run('rm', '-rf', 'dist/deploy/');
run('git', 'checkout-index', '-a', '-f', '--prefix=dist/deploy/');
run('mkdir', '-p', 'dist/deploy/private');
run('cp', `deploy/${deployName}.deploy`, 'dist/deploy/.env');
run('tar', 'caf', 'dist/deploy.tar.gz', '--directory=dist/deploy', '.'); // relative to dist/deploy

// Upload.
runRemote(`rm -rf '${DEPLOY_BUILD_PATH}'`);
run('rsync', '-r', 'dist/deploy.tar.gz', `${DEPLOY_SSH_HOST}:${DEPLOY_BUILD_PATH}/`);

// Deploy.
runRemote(`

# Exit if any command fails.
set -e
set -x

# Decompress archive.
cd '${DEPLOY_BUILD_PATH}'
tar xf deploy.tar.gz

# Copy private from previous deploy.
if [ -d '${DEPLOY_PATH}/private' ]; then
  rsync -a '${DEPLOY_PATH}/private/' '${DEPLOY_BUILD_PATH}/private/'
fi

# Install and build.
npm install   && chown -R www-data:www-data .
npm run build && chown -R www-data:www-data .

# Stop service if running
systemctl stop ${DEPLOY_SERVICE} || true

# Replace with old deploy.
if [ -d '${DEPLOY_PATH}' ]; then
  mv '${DEPLOY_PATH}' '${DEPLOY_PATH}-backup-${new Date().toISOString()}'
fi
mv '${DEPLOY_BUILD_PATH}' '${DEPLOY_PATH}'

systemctl start ${DEPLOY_SERVICE}
`);

// run('ssh', DEPLOY_SSH_HOST, `cd '${DEPLOY_BUILD_PATH}' && unzip deploy.zip`);
// run('ssh', DEPLOY_SSH_HOST, `cd '${DEPLOY_BUILD_PATH}' && npm install`);
// run('ssh', DEPLOY_SSH_HOST, `cd '${DEPLOY_BUILD_PATH}' && chown -R www-data:www-data`);
// run('ssh', DEPLOY_SSH_HOST, `cd '${DEPLOY_BUILD_PATH}' && npm run build`);
// run('ssh', DEPLOY_SSH_HOST, `cd '${DEPLOY_BUILD_PATH}' && chown -R www-data:www-data`);

// await run('ssh', [DEPLOY_SSH_HOST, `systemctl stop ${DEPLOY_SERVICE}`], true);
// if (await run('ssh', [DEPLOY_SSH_HOST, `[ -d '${DEPLOY_PATH}' ]`]) === 0) {

// }

// const zipPath = './dist/deploy.zip';
// const cmdOptions = { name: 'deploy', color: 'fgGreen', debug: true };
// // const tagger = new u.Tagger(cmdOptions);
// const hostAndBuildPath = `${DEPLOY_SSH_HOST}:${DEPLOY_BUILD_PATH}`;

// const run = (cmd: string, args: string[], noThrow?: boolean) =>
//   new u.Command(cmd, args, { ...cmdOptions, noThrow }).run();

// TODO the deploy script must be part of the template and managed by the user.

// # the / at the end of LOCAL_ROOT and REMOTE_ROOT means copy the content
// rsync -arlvhP --delete \
//       --exclude 'node_modules' \
//       --exclude 'dist/bundle.*' \
//       --exclude 'private-files' \
//       --exclude 'design' \
//       --exclude '.git' \
//       --exclude 'npm-shrinkwrap.json' \
//       "$LOCAL_ROOT/" "cdr:$REMOTE_ROOT/"
// }

function runRemote(cmd) {
  return run('ssh', DEPLOY_SSH_HOST, cmd);
}

function runRemoteNoThrow(cmd) {
  return runNoThrow('ssh', DEPLOY_SSH_HOST, cmd);
}

function run(cmd, ...args) {
  const status = runNoThrow(cmd, ...args);
  if (status !== 0) exitWithError(`Command ${cmd} failed with status ${status}.`);
  return status;
}

function runNoThrow(cmd, ...args) {
  console.log(cmd, args.map(x => `"${x}"`).join(' '));
  return cp.spawnSync(cmd, args, { stdio: 'inherit' }).status;
}

function exitWithError(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(-1);
}

// Apply ./deploy/NAME.deploy env variables.
function readEnvVars() {
  if (!deployName) exitWithError('Usage: npm run deploy DEPLOY_NAME');
  fs.accessSync(`deploy/${deployName}.deploy`); // Make sure file exists.
  dotenv.config({ path: `deploy/${deployName}.deploy` });
}
