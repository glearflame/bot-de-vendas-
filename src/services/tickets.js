import { nanoid } from 'nanoid';
import { db } from '../db.js';

export function createTicketCategory({ name, description, emoji }) {
  return db.prepare(`
    INSERT INTO ticket_categories (name, description, emoji)
    VALUES (?, ?, ?)
  `).run(name, description, emoji || '🎫');
}

export function listTicketCategories() {
  return db.prepare('SELECT * FROM ticket_categories WHERE active = 1 ORDER BY name').all();
}

export function createTicket({ userId, threadId, categoryId }) {
  const id = nanoid(10);
  db.prepare(`
    INSERT INTO tickets (id, user_id, thread_id, category_id)
    VALUES (?, ?, ?, ?)
  `).run(id, userId, threadId, categoryId);
  return id;
}

export function closeTicket(threadId) {
  db.prepare(`
    UPDATE tickets SET status = 'closed', closed_at = CURRENT_TIMESTAMP WHERE thread_id = ?
  `).run(threadId);
}
