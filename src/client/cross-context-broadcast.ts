import type { BroadcastChannelMessage } from '../common/types.js';
import log from './logger.js';

export type Listener = (msg: BroadcastChannelMessage) => any;

let channel: BroadcastChannel;
let listeners: Listener[] = [];

export function init() {
  channel = new BroadcastChannel('unforget');

  channel.onmessage = event => {
    const message: BroadcastChannelMessage = event.data;
    log('broadcast received:', message);

    for (const listener of listeners) {
      try {
        listener(message);
      } catch (error) {
        log.error(error);
      }
    }
  };
}

export function addListener(listener: Listener) {
  listeners.push(listener);
}

export function removeListener(listener: Listener) {
  const i = listeners.indexOf(listener);
  if (i !== -1) listeners.splice(i, 1);
}

/**
 * Broadcasts will not be received in the same context. They are only recieved by other contexts (other tabs/windows)
 */
export function broadcast(message: Omit<BroadcastChannelMessage, 'unforgetContextId'>) {
  const fullMessage: BroadcastChannelMessage = { unforgetContextId: window.unforgetContextId, ...message };
  channel.postMessage(fullMessage);
}
