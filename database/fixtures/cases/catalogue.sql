INSERT INTO customers VALUES
    (301, 'abc@example.test');

INSERT INTO products VALUES
    (301, 'P-0', 80),
    (302, 'P-1', 15),
    (303, 'P-2', 5),
    (304, 'P-3', 0);

INSERT INTO orders VALUES
    (301, 301, '2024-03-01 00:00+00'),
    (302, 301, '2024-03-01 00:00+00'),
    (303, 301, '2024-03-31 23:59+00'),
    (304, 301, '2024-04-01 00:00+00');

INSERT INTO order_items VALUES
    (301, 301, 301, 1, 80),
    (302, 302, 302, 1, 15),
    (303, 303, 303, 1, 5),
    (304, 304, 304, 3, 0);

INSERT INTO payments VALUES
    (301, 301, 'SUCCESS', 'a', 80, '2024-03-01 00:00+00'),
    (302, 302, 'SUCCESS', 'b', 15, '2024-03-01 00:00+00'),
    (303, 303, 'SUCCESS', 'c', 5, '2024-03-31 23:59+00');

INSERT INTO order_status_history VALUES
    (301, 301, 'PAID', '2024-03-01 00:00+00'),
    (302, 302, 'CREATED', '2024-03-01 00:00+00'),
    (303, 302, 'DELIVERED', '2024-03-02 00:00+00');

INSERT INTO product_price_history VALUES
    (301, 301, 80, '2024-03-01 00:00+00'),
    (302, 302, 5, '2024-01-01 00:00+00'),
    (303, 302, 15, '2024-04-01 00:00+00'),
    (304, 304, 0, '2024-04-01 00:00+00');

-- Ровно в момент отмены. Заказ вне мартовской выгрузки и покупательской аналитики.
INSERT INTO orders VALUES (305, 301, '2024-04-02 00:00+00');
INSERT INTO order_items VALUES (305, 305, 304, 1, 1);
INSERT INTO payments VALUES (305, 305, 'SUCCESS', 'same-time', 1, '2024-04-02 00:00+00');
INSERT INTO order_status_history VALUES (305, 305, 'CANCELLED', '2024-04-02 00:00+00');
