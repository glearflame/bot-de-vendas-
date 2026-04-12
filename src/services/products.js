import { db } from '../db.js';

export function createProduct({ name, description, priceCents, type }) {
  return db.prepare(`
    INSERT INTO products (name, description, price_cents, type)
    VALUES (?, ?, ?, ?)
  `).run(name, description, priceCents, type);
}

export function listProducts(type = null) {
  const sql = type
    ? 'SELECT * FROM products WHERE active = 1 AND type = ? ORDER BY type, name'
    : 'SELECT * FROM products WHERE active = 1 ORDER BY type, name';

  return type ? db.prepare(sql).all(type) : db.prepare(sql).all();
}

export function getProduct(id) {
  return db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(id);
}
