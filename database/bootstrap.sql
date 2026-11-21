\set ON_ERROR_STOP on
\i /work/database/schema.sql
\i /work/database/indexes.sql
ALTER DATABASE market SET search_path = market, pg_catalog;
ALTER DATABASE market SET timezone = 'UTC';
\i /work/database/seed.sql
