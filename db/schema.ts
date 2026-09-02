import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

export const sharedStories = sqliteTable(
  'shared_stories',
  {
    tokenHash: text('token_hash').primaryKey(),
    requestHash: text('request_hash').notNull().unique(),
    payloadHash: text('payload_hash').notNull(),
    documentJson: text('document_json').notNull(),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (table) => [index('idx_shared_stories_expires_at').on(table.expiresAt)],
);

export const sharePublishWindows = sqliteTable(
  'share_publish_windows',
  {
    clientHash: text('client_hash').notNull(),
    windowStart: integer('window_start').notNull(),
    publishCount: integer('publish_count').notNull(),
  },
  (table) => [primaryKey({ columns: [table.clientHash, table.windowStart] })],
);
