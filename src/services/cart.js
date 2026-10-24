import { nanoid } from 'nanoid';

// Servico de carrinho com o banco injetado. Isso mantem a logica testavel
// (banco em memoria) sem depender de um client do Discord.
export function createCartService(db) {
  const insertCart = db.prepare('INSERT INTO carts (id, user_id, thread_id) VALUES (?, ?, ?)');
  const selectCart = db.prepare('SELECT * FROM carts WHERE id = ?');
  const selectOpenCartByThread = db.prepare(`
    SELECT * FROM carts WHERE thread_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1
  `);
  const selectProductPrice = db.prepare('SELECT price_cents FROM products WHERE id = ? AND active = 1');
  const insertItem = db.prepare(`
    INSERT INTO cart_items (cart_id, product_id, quantity, unit_price) VALUES (?, ?, 1, ?)
    ON CONFLICT(cart_id, product_id) DO UPDATE SET quantity = quantity + 1
  `);
  const incrementItemQuantity = db.prepare(
    'UPDATE cart_items SET quantity = quantity + ? WHERE cart_id = ? AND product_id = ?'
  );
  const deleteNonPositiveItem = db.prepare(
    'DELETE FROM cart_items WHERE cart_id = ? AND product_id = ? AND quantity <= 0'
  );
  const deleteItem = db.prepare('DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?');
  const touch = db.prepare('UPDATE carts SET updated_at = CURRENT_TIMESTAMP WHERE id = ?');

  // Soma relativa feita pelo proprio SQLite, dentro de uma transacao. Assim
  // duas instancias do bot nao perdem incremento por causa de read-then-write.
  const applyItemIncrement = db.transaction((cartId, productId, amount) => {
    const info = incrementItemQuantity.run(amount, cartId, productId);
    if (info.changes === 0) return;

    // Quantidade zerada (ou negativa) remove o item. O DELETE condicional
    // evita apagar uma linha que outra operacao tenha acabado de repor.
    deleteNonPositiveItem.run(cartId, productId);
    touch.run(cartId);
  });

  function createCart({ userId, threadId }) {
    const id = nanoid(10);
    insertCart.run(id, userId, threadId);
    return getCart(id);
  }

  function getCart(id) {
    return selectCart.get(id);
  }

  function getOpenCartByThread(threadId) {
    return selectOpenCartByThread.get(threadId);
  }

  function setCartMessageId(cartId, messageId) {
    db.prepare('UPDATE carts SET cart_message_id = ? WHERE id = ?').run(messageId, cartId);
  }

  function addItem(cartId, productId) {
    // Congela o preco do produto no momento em que o item entra no carrinho.
    const product = selectProductPrice.get(productId);
    if (!product) return { changes: 0 };

    const info = insertItem.run(cartId, productId, product.price_cents);
    touch.run(cartId);
    return info;
  }

  function incrementItem(cartId, productId, amount) {
    applyItemIncrement(cartId, productId, amount);
  }

  function removeItem(cartId, productId) {
    deleteItem.run(cartId, productId);
    touch.run(cartId);
  }

  function getCartItems(cartId) {
    return db.prepare(`
      SELECT p.id, p.name, p.description, p.type, ci.quantity,
             COALESCE(ci.unit_price, p.price_cents) AS unit_price,
             p.price_cents AS current_price_cents,
             (COALESCE(ci.unit_price, p.price_cents) * ci.quantity) AS subtotal_cents,
             (COALESCE(ci.unit_price, p.price_cents) <> p.price_cents) AS price_changed
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.cart_id = ?
      ORDER BY p.type DESC, p.name
    `).all(cartId);
  }

  function getCartTotal(cartId) {
    const total = db.prepare(`
      SELECT COALESCE(SUM(COALESCE(ci.unit_price, p.price_cents) * ci.quantity), 0) AS total
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.cart_id = ?
    `).get(cartId);

    return total.total;
  }

  function closeCart(cartId, status) {
    db.prepare('UPDATE carts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, cartId);
  }

  // Carrinhos abertos que contem o produto, para atualizar as mensagens
  // quando o dono edita o preco.
  function listOpenCartsContainingProduct(productId) {
    return db.prepare(`
      SELECT DISTINCT c.*
      FROM carts c
      JOIN cart_items ci ON ci.cart_id = c.id
      WHERE c.status = 'open' AND ci.product_id = ?
    `).all(productId);
  }

  return {
    createCart,
    getCart,
    getOpenCartByThread,
    setCartMessageId,
    addItem,
    incrementItem,
    removeItem,
    getCartItems,
    getCartTotal,
    closeCart,
    listOpenCartsContainingProduct
  };
}
