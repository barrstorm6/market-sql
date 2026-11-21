\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = market, pg_catalog;
SET LOCAL TIME ZONE 'UTC';
TRUNCATE customers, products, orders, order_items, payments, refunds, order_status_history, product_price_history RESTART IDENTITY;
\ir fixtures/basic.sql
\ir fixtures/edge_cases.sql
\ir fixtures/sync_ids.sql
COMMIT;
ANALYZE;
