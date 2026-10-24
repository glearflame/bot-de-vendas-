import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrateDatabase } from '../src/schema.js';
import {
  markThreadArchived,
  runThreadsCleanup,
  selectInactiveThreads
} from '../src/services/threads.js';

const NOW = new Date('2026-01-15T12:00:00Z');

const db = new Database(':memory:');
db.pragma('foreign_keys = ON');
migrateDatabase(db);


test.beforeEach(() => {
  db.exec('DELETE FROM archived_threads');
  db.exec('DELETE FROM payments');
  db.exec('DELETE FROM carts');
  db.exec('DELETE FROM tickets');
});

function insertCart(db, { id, threadId, userId = 'cliente-1', status = 'cancelled', createdAt, updatedAt }) {
  db.prepare(`
    INSERT INTO carts (id, user_id, thread_id, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, threadId, status, createdAt, updatedAt ?? createdAt);
}

function insertTicket(db, { id, threadId, userId = 'cliente-1', status = 'open', createdAt }) {
  db.prepare(`
    INSERT INTO tickets (id, user_id, thread_id, status, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, userId, threadId, status, createdAt);
}

function insertPayment(db, { id, cartId, status = 'pending' }) {
  db.prepare(`
    INSERT INTO payments (id, cart_id, user_id, amount_cents, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, cartId, 'cliente-1', 1000, status);
}

function mockGuild(threadIds, { failIds = [] } = {}) {
  const calls = [];
  const threads = new Map(threadIds.map((threadId) => [threadId, {
    id: threadId,
    archived: false,
    async setArchived(value, reason) {
      if (failIds.includes(threadId)) throw new Error('falha simulada');
      calls.push({ threadId, value, reason });
      this.archived = value;
    }
  }]));

  return {
    calls,
    guild: {
      channels: {
        async fetch(threadId) {
          return threads.get(threadId) ?? null;
        }
      }
    }
  };
}

test('seleciona apenas threads antigas e sem pendencia', () => {
  
  insertCart(db, { id: 'old-cart', threadId: 'thread-old-cart', createdAt: '2026-01-01 10:00:00' });
  insertCart(db, { id: 'recent-cart', threadId: 'thread-recent', createdAt: '2026-01-14 10:00:00' });
  insertCart(db, {
    id: 'open-cart',
    threadId: 'thread-open',
    status: 'open',
    createdAt: '2026-01-01 10:00:00'
  });
  insertCart(db, { id: 'proof-cart', threadId: 'thread-proof', createdAt: '2026-01-01 10:00:00' });
  insertPayment(db, { id: 'proof-payment', cartId: 'proof-cart', status: 'proof_sent' });
  insertCart(db, { id: 'archived-cart', threadId: 'thread-archived-cart', createdAt: '2026-01-01 10:00:00' });
  markThreadArchived(db, 'thread-archived-cart', 'staff-1');

  insertTicket(db, { id: 'old-ticket', threadId: 'thread-old-ticket', createdAt: '2026-01-01 10:00:00' });
  insertTicket(db, { id: 'recent-ticket', threadId: 'thread-recent-ticket', createdAt: '2026-01-14 10:00:00' });
  insertTicket(db, {
    id: 'closed-ticket',
    threadId: 'thread-closed-ticket',
    status: 'closed',
    createdAt: '2026-01-01 10:00:00'
  });
  insertTicket(db, { id: 'archived-ticket', threadId: 'thread-archived-ticket', createdAt: '2026-01-01 10:00:00' });
  markThreadArchived(db, 'thread-archived-ticket', 'staff-1');

  const selected = selectInactiveThreads(db, { days: 7, now: NOW });
  const threadIds = selected.map((item) => item.threadId).sort();

  assert.deepEqual(threadIds, ['thread-old-cart', 'thread-old-ticket']);
  assert.equal(selected.find((item) => item.threadId === 'thread-old-cart').kind, 'cart');
  assert.equal(selected.find((item) => item.threadId === 'thread-old-ticket').kind, 'ticket');
});

test('dry-run lista sem chamar setArchived nem gravar arquivamento', async () => {
    insertCart(db, { id: 'c1', threadId: 'thread-1', createdAt: '2026-01-01 10:00:00' });
  insertCart(db, { id: 'c2', threadId: 'thread-2', createdAt: '2026-01-02 10:00:00' });
  const { guild, calls } = mockGuild(['thread-1', 'thread-2']);

  const result = await runThreadsCleanup({ db, guild, days: 7, dryRun: true, now: NOW });

  assert.equal(result.candidates.length, 2);
  assert.equal(result.archived.length, 0);
  assert.equal(calls.length, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM archived_threads').get().total, 0);
});

test('execucao real arquiva threads e a segunda rodada age em zero', async () => {
    insertCart(db, { id: 'c1', threadId: 'thread-1', createdAt: '2026-01-01 10:00:00' });
  insertCart(db, { id: 'c2', threadId: 'thread-2', createdAt: '2026-01-02 10:00:00' });
  const { guild, calls } = mockGuild(['thread-1', 'thread-2']);

  const first = await runThreadsCleanup({ db, guild, days: 7, dryRun: false, now: NOW });
  assert.equal(first.archived.length, 2);
  assert.equal(first.errors.length, 0);
  assert.deepEqual(calls.map((call) => call.threadId).sort(), ['thread-1', 'thread-2']);
  assert.ok(calls.every((call) => call.value === true));

  const second = await runThreadsCleanup({ db, guild, days: 7, dryRun: false, now: NOW });
  assert.equal(second.candidates.length, 0);
  assert.equal(second.archived.length, 0);
  assert.equal(calls.length, 2);
});

test('falha em uma thread nao interrompe as outras', async () => {
    insertCart(db, { id: 'c1', threadId: 'thread-1', createdAt: '2026-01-01 10:00:00' });
  insertCart(db, { id: 'c2', threadId: 'thread-2', createdAt: '2026-01-02 10:00:00' });
  insertCart(db, { id: 'c3', threadId: 'thread-3', createdAt: '2026-01-03 10:00:00' });
  const { guild, calls } = mockGuild(['thread-1', 'thread-2', 'thread-3'], { failIds: ['thread-2'] });

  const result = await runThreadsCleanup({ db, guild, days: 7, dryRun: false, now: NOW });

  assert.equal(result.archived.length, 2);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].threadId, 'thread-2');
  assert.deepEqual(calls.map((call) => call.threadId).sort(), ['thread-1', 'thread-3']);

  const archived = db.prepare('SELECT thread_id FROM archived_threads ORDER BY thread_id').all();
  assert.deepEqual(archived.map((row) => row.thread_id), ['thread-1', 'thread-3']);
});
