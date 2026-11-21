CREATE INDEX orders_customer ON market.orders(customer_id);
CREATE INDEX items_order ON market.order_items(order_id);
CREATE INDEX payments_order ON market.payments(order_id);
CREATE INDEX refunds_order ON market.refunds(order_id);
CREATE INDEX statuses_order ON market.order_status_history(order_id);
CREATE INDEX prices_lookup ON market.product_price_history(product_id, valid_from);
