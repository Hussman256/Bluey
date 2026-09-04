import { fileURLToPath } from 'node:url';

export const config = {
  port: Number(process.env.PORT ?? 8788),
  dbPath: process.env.DB_PATH ?? fileURLToPath(new URL('../data/relay.db', import.meta.url)),
  keyPath: process.env.KEY_PATH ?? fileURLToPath(new URL('../data/relay.key', import.meta.url)),

  /** NIP-11 relay information. */
  info: {
    name: process.env.RELAY_NAME ?? '1btc clubs',
    description: 'NIP-29 group relay for 1btc — free, member-enforced clubs.',
    supported_nips: [1, 11, 29, 42],
    software: 'https://github.com/Hussman256/1btc',
    version: '0.1.0',
  },

  /** New groups default to open membership (anyone can join). v1 has no paid gating. */
  defaultOpen: true,
};
