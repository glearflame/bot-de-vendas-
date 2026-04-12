import { nanoid } from 'nanoid';
import { db } from '../db.js';

export function createPayment({ cartId, userId, amountCents }) {
  const id = nanoid(12);
  db.prepare(`
    INSERT INTO payments (id, cart_id, user_id, amount_cents)
    VALUES (?, ?, ?, ?)
  `).run(id, cartId, userId, amountCents);
  return getPayment(id);
}

export function getPayment(id) {
  return db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
}

export function getPaymentByCart(cartId) {
  return db.prepare('SELECT * FROM payments WHERE cart_id = ? ORDER BY created_at DESC LIMIT 1').get(cartId);
}

export function attachProof({ paymentId, proofUrl }) {
  db.prepare(`
    UPDATE payments SET proof_url = ?, status = 'proof_sent' WHERE id = ?
  `).run(proofUrl, paymentId);
}

export function reviewPayment({ paymentId, reviewerId, approved }) {
  const status = approved ? 'approved' : 'rejected';
  db.prepare(`
    UPDATE payments
    SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, reviewerId, paymentId);

  return getPayment(paymentId);
}

export function createSaleFromPayment(payment) {
  const id = nanoid(12);
  db.prepare(`
    INSERT INTO sales (id, payment_id, cart_id, user_id, amount_cents)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, payment.id, payment.cart_id, payment.user_id, payment.amount_cents);
  return db.prepare('SELECT * FROM sales WHERE id = ?').get(id);
}

export function markDelivered(saleId) {
  db.prepare(`
    UPDATE sales SET delivered = 1, delivered_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(saleId);
}

export function listRecentSales(limit = 10) {
  return db.prepare(`
    SELECT * FROM sales ORDER BY created_at DESC LIMIT ?
  `).all(limit);
}
