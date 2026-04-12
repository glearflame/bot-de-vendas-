import { nanoid } from 'nanoid';
import { db } from '../db.js';

export function createCart({ userId, threadId }) {
  const id = nanoid(10);
  db.prepare('INSERT INTO carts (id, user_id, thread_id) VALUES (?, ?, ?)').run(id, userId, threadId);
  return getCart(id);
}

export function getCart(id) {
  return db.prepare('SELECT * FROM carts WHERE id = ?').get(id);
}

export function getOpenCartByThread(threadId) {
  return db.prepare(`
    SELECT * FROM carts WHERE thread_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1
  `).get(threadId);
}

export function setCartMessageId(cartId, messageId) {
  db.prepare('UPDATE carts SET cart_message_id = ? WHERE id = ?').run(messageId, cartId);
}

export function addItem(cartId, productId) {
  db.prepare(`
    INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, 1)
    ON CONFLICT(cart_id, product_id) DO UPDATE SET quantity = quantity + 1
  `).run(cartId, productId);
  touchCart(cartId);
}

export function incrementItem(cartId, productId, amount) {
  const item = db.prepare('SELECT quantity FROM cart_items WHERE cart_id = ? AND product_id = ?').get(cartId, productId);
  if (!item) return;

  const nextQuantity = item.quantity + amount;
  if (nextQuantity <= 0) {
    removeItem(cartId, productId);
    return;
  }

  db.prepare('UPDATE cart_items SET quantity = ? WHERE cart_id = ? AND product_id = ?').run(nextQuantity, cartId, productId);
  touchCart(cartId);
}

export function removeItem(cartId, productId) {
  db.prepare('DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?').run(cartId, productId);
  touchCart(cartId);
}

export function getCartItems(cartId) {
  return db.prepare(`
    SELECT p.id, p.name, p.description, p.price_cents, p.type, ci.quantity,
           (p.price_cents * ci.quantity) AS subtotal_cents
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    WHERE ci.cart_id = ?
    ORDER BY p.type DESC, p.name
  `).all(cartId);
}

export function getCartTotal(cartId) {
  const total = db.prepare(`
    SELECT COALESCE(SUM(p.price_cents * ci.quantity), 0) AS total
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    WHERE ci.cart_id = ?
  `).get(cartId);

  return total.total;
}

export function closeCart(cartId, status) {
  db.prepare('UPDATE carts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, cartId);
}

function touchCart(cartId) {
  db.prepare('UPDATE carts SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(cartId);
}
