import type { ClientToServiceWorkerMessage } from '../common/types.js';
import log from './logger.js';

export async function postToServiceWorker(message: ClientToServiceWorkerMessage) {
  try {
    const reg = await navigator.serviceWorker?.ready;
    reg?.active?.postMessage(message);
  } catch (error) {
    log.error(error);
  }
}
