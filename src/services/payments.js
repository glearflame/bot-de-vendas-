import { nanoid } from 'nanoid';

// Servico de pagamentos/vendas com banco injetado e sem dependencia do Discord.
export function createPaymentsService(db) {
  const insertPayment = db.prepare(`
    INSERT INTO payments (id, cart_id, user_id, amount_cents)
    VALUES (?, ?, ?, ?)
  `);
  const selectPayment = db.prepare('SELECT * FROM payments WHERE id = ?');
  const selectPaymentByCart = db.prepare(
    'SELECT * FROM payments WHERE cart_id = ? ORDER BY created_at DESC LIMIT 1'
  );
  const attachProofStmt = db.prepare(`
    UPDATE payments SET proof_url = ?, status = 'proof_sent' WHERE id = ?
  `);
  // Update condicional: so transiciona quem ainda esta em proof_sent. Duas
  // interacoes concorrentes/duplicadas nao podem aprovar o mesmo pagamento.
  const reviewStmt = db.prepare(`
    UPDATE payments
    SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'proof_sent'
  `);
  const insertSale = db.prepare(`
    INSERT INTO sales (id, payment_id, cart_id, user_id, amount_cents)
    VALUES (?, ?, ?, ?, ?)
  `);
  const selectSale = db.prepare('SELECT * FROM sales WHERE id = ?');

  function createPayment({ cartId, userId, amountCents }) {
    const id = nanoid(12);
    insertPayment.run(id, cartId, userId, amountCents);
    return getPayment(id);
  }

  function getPayment(id) {
    return selectPayment.get(id);
  }

  function getPaymentByCart(cartId) {
    return selectPaymentByCart.get(cartId);
  }

  function attachProof({ paymentId, proofUrl }) {
    attachProofStmt.run(proofUrl, paymentId);
  }

  function reviewPayment({ paymentId, reviewerId, approved }) {
    const status = approved ? 'approved' : 'rejected';
    const info = reviewStmt.run(status, reviewerId, paymentId);

    if (info.changes === 0) {
      const payment = getPayment(paymentId);
      return {
        ok: false,
        reason: payment ? 'already_processed' : 'not_found',
        payment: payment ?? null
      };
    }

    return { ok: true, payment: getPayment(paymentId) };
  }

  function createSaleFromPayment(payment) {
    const id = nanoid(12);
    insertSale.run(id, payment.id, payment.cart_id, payment.user_id, payment.amount_cents);
    return selectSale.get(id);
  }

  function markDelivered(saleId) {
    db.prepare(`
      UPDATE sales SET delivered = 1, delivered_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(saleId);
  }

  function listRecentSales(limit = 10) {
    return db.prepare(`
      SELECT * FROM sales ORDER BY created_at DESC LIMIT ?
    `).all(limit);
  }

  return {
    createPayment,
    getPayment,
    getPaymentByCart,
    attachProof,
    reviewPayment,
    createSaleFromPayment,
    markDelivered,
    listRecentSales
  };
}
