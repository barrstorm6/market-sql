-- Идентификаторы ниже 10000 зарезервированы для сценариев с ручными данными.
CREATE TEMP TABLE sizes ON COMMIT DROP AS
SELECT :'scale'::integer AS n, abs(:'seed'::bigint % 1000000) AS shift,
       greatest(100, :'scale'::integer / 4) AS nc,
       greatest(50, :'scale'::integer / 40) AS np;
ALTER TABLE sizes ADD CHECK (n BETWEEN 1 AND 2000000);
INSERT INTO customers
SELECT 10000+i, 'buyer-' || i || '@example.test' FROM sizes, generate_series(1,nc) i;
INSERT INTO products
SELECT 10000+i, 'SKU-' || i, 10+i%113 FROM sizes, generate_series(1,np) i;
INSERT INTO orders
SELECT 10000+i, 10001+(i*31::bigint+shift)%nc,
       timestamptz '2024-01-01 00:00Z' + ((i*173::bigint+shift)%259200) * interval '1 minute'
FROM sizes, generate_series(1,n) i;
INSERT INTO order_items
SELECT 10000+2*i+k, 10000+i, p.id, 1+(i+k)%3, p.current_price
FROM sizes CROSS JOIN LATERAL generate_series(1,n) i CROSS JOIN generate_series(0,1) k
JOIN products p ON true
WHERE p.id=10001+(i*7::bigint+k+shift)%np;
INSERT INTO payments
SELECT 10000+2*(o.id-10000)+k, o.id, CASE k WHEN 0 THEN 'FAILED' ELSE 'SUCCESS' END,
       'txn-'||o.id, s.amount, o.created_at+(k+1)*interval '1 minute'
FROM orders o JOIN (SELECT order_id, sum(quantity*unit_price) amount FROM order_items GROUP BY order_id) s
ON s.order_id=o.id CROSS JOIN generate_series(0,1) k;
INSERT INTO refunds
SELECT o.id, o.id, 1, o.created_at+interval '1 day' FROM orders o WHERE o.id%5=0;
INSERT INTO order_status_history
SELECT 10000+4*(o.id-10000)+k, o.id, (ARRAY['CREATED','PAID','SHIPPED','DELIVERED'])[k],
       o.created_at+(k-1)*interval '1 day' FROM orders o CROSS JOIN generate_series(1,4) k;
INSERT INTO product_price_history
SELECT 10000+3*(p.id-10000)+k, p.id, p.current_price+k,
       timestamptz '2023-12-01 00:00Z'+k*interval '1 month'
FROM products p CROSS JOIN generate_series(0,2) k;
