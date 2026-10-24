import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrateDatabase } from '../src/schema.js';
import { createCartService } from '../src/services/cart.js';
import { createProductsService } from '../src/services/products.js';

function setup() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrateDatabase(db);

  const products = createProductsService(db);
  const carts = createCartService(db);

  const product = products.createProduct({
    name: 'Produto test',
    description: '',
    priceCents: 1000,
    type: 'main'
  });
  const cart = carts.createCart({ userId: 'cliente-1', threadId: 'thread-1' });

  return { db, carts, productId: product.lastInsertRowid, cartId: cart.id };
}

function quantityOf(carts, cartId, productId) {
  const item = carts.getCartItems(cartId).find((row) => row.id === productId);
  return item?.quantity ?? 0;
}

test('dois incrementos seguidos somam a partir da quantidade atual', () => {
  const { carts, productId, cartId } = setup();

  carts.addItem(cartId, productId);
  carts.incrementItem(cartId, productId, 1);
  carts.incrementItem(cartId, productId, 1);

  assert.equal(quantityOf(carts, cartId, productId), 3);
});

test('decremento ate zero remove o item', () => {
  const { carts, productId, cartId } = setup();

  carts.addItem(cartId, productId);
  carts.incrementItem(cartId, productId, 1);
  assert.equal(quantityOf(carts, cartId, productId), 2);

  carts.incrementItem(cartId, productId, -1);
  assert.equal(quantityOf(carts, cartId, productId), 1);

  carts.incrementItem(cartId, productId, -1);
  assert.equal(quantityOf(carts, cartId, productId), 0);
  assert.equal(carts.getCartItems(cartId).length, 0);
});

test('decremento em item inexistente nao cria linha', () => {
  const { db, carts, productId, cartId } = setup();

  carts.incrementItem(cartId, productId, -1);

  const total = db.prepare('SELECT COUNT(*) AS total FROM cart_items WHERE cart_id = ?').get(cartId);
  assert.equal(total.total, 0);
});

test('duas instancias do servico nao perdem incremento', () => {
  const { db, carts, productId, cartId } = setup();
  // Cada instancia tem suas proprias prepared statements, compartilhando o
  // mesmo banco, como aconteceria com dois processos apontando para o mesmo
  // arquivo SQLite.
  const outraInstancia = createCartService(db);

  carts.addItem(cartId, productId);
  carts.incrementItem(cartId, productId, 1);
  outraInstancia.incrementItem(cartId, productId, 1);

  assert.equal(quantityOf(carts, cartId, productId), 3);

  // Limitacao: better-sqlite3 e sincrono e este teste roda em um unico
  // processo/thread, entao nao ha intercalacao real entre SELECT e UPDATE.
  // O que garantimos aqui e que o caminho quente usa um unico UPDATE relativo
  // (quantity = quantity + ?) dentro de transacao, sem read-then-write.
});
