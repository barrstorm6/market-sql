DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['customers','products','orders','order_items','payments',
                             'refunds','order_status_history','product_price_history']
    LOOP
        EXECUTE format('SELECT setval(pg_get_serial_sequence(%L, ''id''), max(id)) FROM %I', t, t);
    END LOOP;
END $$;
