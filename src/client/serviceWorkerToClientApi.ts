// Default type of `self` is `WorkerGlobalScope & typeof globalThis`
// https://github.com/microsoft/TypeScript/issues/14877
declare var self: ServiceWorkerGlobalScope;
import type { ServiceWorkerToClientMessage } from '../common/types.js';
import log from './logger.js';

export function postToClient(client: Client, message: ServiceWorkerToClientMessage) {
  client.postMessage(message);
}

export async function postToClients(message: ServiceWorkerToClientMessage, options?: { except?: Client[] }) {
  try {
    const clients = await self.clients.matchAll();
    for (const client of clients) {
      if (!options?.except?.includes(client)) {
        postToClient(client, message);
      }
    }
  } catch (error) {
    log.error(error);
  }
}
