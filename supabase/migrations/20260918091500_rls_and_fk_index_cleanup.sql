-- Production hardening: remove duplicate permissive policies,
-- optimize auth.uid() lookup, and cover all public foreign keys with indexes.

DROP POLICY IF EXISTS "admins read settings" ON public.bot_settings;
DROP POLICY IF EXISTS "Admins can view setup codes" ON public.chat_setup_codes;

DROP POLICY IF EXISTS "users read own roles" ON public.user_roles;
CREATE POLICY "users read own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = (select auth.uid()));

DO $$
DECLARE
  r record;
  idx_name text;
  cols text;
BEGIN
  FOR r IN
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      con.conname AS constraint_name,
      con.conrelid,
      con.conkey
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.contype = 'f'
      AND n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_index i
        WHERE i.indrelid = con.conrelid
          AND i.indisvalid
          AND i.indisready
          AND (i.indkey::smallint[])[0:cardinality(con.conkey)-1] = con.conkey
      )
  LOOP
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY u.ord)
      INTO cols
    FROM unnest(r.conkey) WITH ORDINALITY AS u(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = r.conrelid AND a.attnum = u.attnum;

    idx_name := left(r.table_name || '_' || replace(r.constraint_name, '_fkey', '') || '_idx', 63);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.%I (%s)',
                   idx_name, r.schema_name, r.table_name, cols);
  END LOOP;
END $$;
