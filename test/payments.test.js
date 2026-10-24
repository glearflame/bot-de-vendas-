import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrateDatabase } from '../src/schema.js';
import { createCartService } from '../src/services/cart.js';
import { createPaymentsService } from '../src/services/payments.js';
import { createProductsService } from '../src/services/products.js';

function setup() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrateDatabase(db);

  const products = createProductsService(db);
  const carts = createCartService(db);
  const payments = createPaymentsService(db);

  const product = products.createProduct({
    name: 'Produto test',
    description: '',
    priceCents: 1000,
    type: 'main'
  });
  const cart = carts.createCart({ userId: 'cliente-1', threadId: 'thread-1' });

  return { db, products, carts, payments, productId: product.lastInsertRowid, cartId: cart.id };
}

function createProofSentPayment(payments, cartId, amountCents = 1000) {
  const payment = payments.createPayment({
    cartId,
    userId: 'cliente-1',
    amountCents
  });
  payments.attachProof({ paymentId: payment.id, proofUrl: 'https://exemplo/comprovante.png' });
  return payment.id;
}

test('duas aprovacoes seguidas criam apenas uma venda', () => {
  const { db, payments, cartId } = setup();
  const paymentId = createProofSentPayment(payments, cartId);

  const first = payments.approvePayment({ paymentId, reviewerId: 'staff-1' });
  const second = payments.approvePayment({ paymentId, reviewerId: 'staff-2' });

  assert.equal(first.ok, true);
  assert.equal(first.sale.payment_id, paymentId);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'already_processed');

  const sales = db.prepare('SELECT * FROM sales WHERE payment_id = ?').all(paymentId);
  assert.equal(sales.length, 1);

  const payment = payments.getPayment(paymentId);
  assert.equal(payment.status, 'approved');
  assert.equal(payment.reviewed_by, 'staff-1');

  const cart = db.prepare('SELECT status FROM carts WHERE id = ?').get(cartId);
  assert.equal(cart.status, 'paid');
});

test('duas reprovacoes seguidas nao reprocessam o pagamento', () => {
  const { payments, cartId } = setup();
  const paymentId = createProofSentPayment(payments, cartId);

  const first = payments.rejectPayment({ paymentId, reviewerId: 'staff-1' });
  const second = payments.rejectPayment({ paymentId, reviewerId: 'staff-2' });

  assert.equal(first.ok, true);
  assert.equal(first.payment.status, 'rejected');
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'already_processed');
});

test('falha simulada no meio da aprovacao faz rollback de tudo', () => {
  const { db, payments, cartId } = setup();
  const paymentId = createProofSentPayment(payments, cartId);

  db.exec(`
    CREATE TRIGGER falha_venda
    BEFORE INSERT ON sales
    BEGIN
      SELECT RAISE(ABORT, 'falha simulada na venda');
    END;
  `);

  assert.throws(
    () => payments.approvePayment({ paymentId, reviewerId: 'staff-1' }),
    /falha simulada na venda/
  );

  const payment = payments.getPayment(paymentId);
  assert.equal(payment.status, 'proof_sent');
  assert.equal(payment.reviewed_by, null);
  assert.equal(payment.reviewed_at, null);

  const cart = db.prepare('SELECT status FROM carts WHERE id = ?').get(cartId);
  assert.equal(cart.status, 'open');

  const sales = db.prepare('SELECT * FROM sales').all();
  assert.equal(sales.length, 0);
});

test('migracao preenche unit_price de itens antigos e pode rodar duas vezes', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price_cents INTEGER NOT NULL
    );
    CREATE TABLE carts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open'
    );
    CREATE TABLE cart_items (
      cart_id TEXT NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY(cart_id, product_id)
    );
  `);

  db.prepare('INSERT INTO products (name, price_cents) VALUES (?, ?)').run('Antigo', 1500);
  db.prepare('INSERT INTO carts (id, user_id, thread_id) VALUES (?, ?, ?)').run('c1', 'u1', 't1');
  db.prepare('INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)').run('c1', 1, 2);

  migrateDatabase(db);
  migrateDatabase(db);

  const columns = db.prepare('PRAGMA table_info(cart_items)').all();
  assert.equal(columns.filter((column) => column.name === 'unit_price').length, 1);

  const item = db.prepare('SELECT unit_price FROM cart_items WHERE cart_id = ? AND product_id = ?')
    .get('c1', 1);
  assert.equal(item.unit_price, 1500);

  const cartsColumns = db.prepare('PRAGMA table_info(carts)').all();
  assert.equal(cartsColumns.filter((column) => column.name === 'cart_message_id').length, 1);
});

test('preco congelado no carrinho nao muda quando o produto e atualizado', () => {
  const { db, products, carts, payments, productId, cartId } = setup();

  carts.addItem(cartId, productId);
  carts.addItem(cartId, productId);
  assert.equal(carts.getCartTotal(cartId), 2000);

  products.updateProductPrice(productId, 2500);

  // Total e checkout continuam usando o preco congelado (1000 cada).
  assert.equal(carts.getCartTotal(cartId), 2000);

  const items = carts.getCartItems(cartId);
  assert.equal(items.length, 1);
  assert.equal(items[0].unit_price, 1000);
  assert.equal(items[0].current_price_cents, 2500);
  assert.equal(items[0].price_changed, 1);
  assert.equal(items[0].subtotal_cents, 2000);

  const payment = payments.createPayment({
    cartId,
    userId: 'cliente-1',
    amountCents: carts.getCartTotal(cartId)
  });
  assert.equal(payment.amount_cents, 2000);

  const product = db.prepare('SELECT price_cents FROM products WHERE id = ?').get(productId);
  assert.equal(product.price_cents, 2500);
});
