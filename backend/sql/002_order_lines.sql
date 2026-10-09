-- Bitta buyurtmada bir nechta mahsulot: [{productId, qty, price}]
-- price — so'm/dona QQS bilan (0 — kalkulyatsiyadagi narx olinadi)
ALTER TABLE orders ADD COLUMN lines jsonb NOT NULL DEFAULT '[]';
UPDATE orders SET lines = jsonb_build_array(jsonb_build_object('productId', product_id::text, 'qty', qty, 'price', price))
 WHERE product_id IS NOT NULL;
ALTER TABLE orders DROP COLUMN product_id, DROP COLUMN qty, DROP COLUMN price;
CREATE INDEX orders_lines ON orders USING gin (lines jsonb_path_ops);
