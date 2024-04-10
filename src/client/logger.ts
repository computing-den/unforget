import * as api from './api.js';

function log(...args: any[]) {
  console.log(...args);
  if (Number(process.env.FORWARD_LOGS_TO_SERVER)) {
    api.post('/api/log', { message: stringify(...args) });
  }
}

log.error = function error(...args: any[]) {
  console.error(...args);
  if (Number(process.env.FORWARD_LOGS_TO_SERVER)) {
    api.post('/api/error', { message: stringify(...args) });
  }
};

function stringify(...args: any[]): string {
  let strs = [];
  for (const arg of args) {
    if (typeof arg === 'string') {
      strs.push(arg);
    } else if (arg instanceof Error) {
      strs.push(arg.toString());
    } else {
      strs.push(JSON.stringify(arg));
    }
  }
  return strs.join(' ');
}

export default log;
