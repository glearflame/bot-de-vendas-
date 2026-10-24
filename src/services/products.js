export function createProductsService(db) {
  function createProduct({ name, description, priceCents, type }) {
    return db.prepare(`
      INSERT INTO products (name, description, price_cents, type)
      VALUES (?, ?, ?, ?)
    `).run(name, description, priceCents, type);
  }

  function listProducts(type = null) {
    const sql = type
      ? 'SELECT * FROM products WHERE active = 1 AND type = ? ORDER BY type, name'
      : 'SELECT * FROM products WHERE active = 1 ORDER BY type, name';

    return type ? db.prepare(sql).all(type) : db.prepare(sql).all();
  }

  function getProduct(id) {
    return db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(id);
  }

  function updateProductPrice(id, priceCents) {
    return db.prepare('UPDATE products SET price_cents = ? WHERE id = ? AND active = 1')
      .run(priceCents, id);
  }

  return {
    createProduct,
    listProducts,
    getProduct,
    updateProductPrice
  };
}
