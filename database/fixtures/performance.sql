\set ON_ERROR_STOP on
\if :{?scale}
\else
\set scale 100000
\endif
\if :{?seed}
\else
\set seed 17
\endif
BEGIN;
SET LOCAL search_path = market, pg_catalog;
SET LOCAL TIME ZONE 'UTC';
TRUNCATE customers, products, orders, order_items, payments, refunds, order_status_history, product_price_history RESTART IDENTITY;
\ir generate.sql
\ir sync_ids.sql
COMMIT;
ANALYZE;
