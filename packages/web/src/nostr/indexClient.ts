import {
  DEFAULT_INDEX_URL,
  type Frame,
  type Request,
  type RequestMethod,
} from '@1btc/shared';

type Pending = {
  resolve: (f: Frame) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * Thin client for the 1btc index service. One WebSocket, request/response by id.
 * Everything degrades gracefully: if the socket is down, callers fall back to
 * talking to relays directly (which the app already does).
 */
export class IndexClient {
  private url: string;
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private seq = 0;
  private reconnectDelay = 1000;
  private closed = false;
  private listeners = new Set<(up: boolean) => void>();

  constructor(url = import.meta.env.VITE_INDEX_URL || DEFAULT_INDEX_URL) {
    this.url = url;
    this.connect();
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  onStatus(fn: (up: boolean) => void): () => void {
    this.listeners.add(fn);
    fn(this.connected); // sync caller to current state immediately
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(up: boolean) {
    for (const l of this.listeners) l(up);
  }

  private connect() {
    if (this.closed) return;
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.emit(true);
    };
    this.ws.onmessage = (e) => {
      let frame: Frame;
      try {
        frame = JSON.parse(e.data);
      } catch {
        return;
      }
      const p = this.pending.get(frame.id);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(frame.id);
      p.resolve(frame);
    };
    this.ws.onclose = () => {
      this.emit(false);
      this.failAll(new Error('index socket closed'));
      this.scheduleReconnect();
    };
    this.ws.onerror = () => this.ws?.close();
  }

  private scheduleReconnect() {
    if (this.closed) return;
    setTimeout(() => this.connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 15_000);
  }

  private failAll(err: Error) {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  request(method: RequestMethod, params: Request['params'], timeoutMs = 8000): Promise<Frame> {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error('index offline'));
        return;
      }
      const id = `r${++this.seq}`;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('index timeout'));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws!.send(JSON.stringify({ id, method, params } satisfies Request));
    });
  }

  dispose() {
    this.closed = true;
    this.ws?.close();
  }
}

let singleton: IndexClient | null = null;
export function getIndexClient() {
  singleton ??= new IndexClient();
  return singleton;
}
