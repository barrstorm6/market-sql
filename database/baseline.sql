-- Мартовский отчёт по строкам заказов, включая товары без продаж.
SELECT p.id AS product_id,
       coalesce((SELECT sum(i.quantity)
                 FROM market.order_items i JOIN market.orders o ON o.id = i.order_id
                 WHERE i.product_id = p.id
                   AND to_char(o.created_at AT TIME ZONE 'UTC', 'YYYY-MM') = '2024-03'), 0) AS units,
       coalesce((SELECT sum(i.quantity * i.unit_price)
                 FROM market.order_items i JOIN market.orders o ON o.id = i.order_id
                 WHERE i.product_id = p.id
                   AND to_char(o.created_at AT TIME ZONE 'UTC', 'YYYY-MM') = '2024-03'), 0) AS gross
FROM market.products p
ORDER BY p.id;
