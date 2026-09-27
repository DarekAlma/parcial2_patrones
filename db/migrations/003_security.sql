-- =============================================================================
-- 003 · Seguridad por diseño en la base de datos
--
-- En Supabase, todo lo que está en `public` queda expuesto automáticamente por
-- PostgREST y pg_graphql a los roles `anon` y `authenticated` (con la anon key
-- pública). Activamos RLS para que esos roles SOLO puedan leer el catálogo y
-- nunca escribirlo. Los servicios internos se conectan como `postgres`
-- (dueño de las tablas), que no está sujeto a RLS.
-- =============================================================================

alter table public.flight_offers  enable row level security;
alter table public.hotel_offers   enable row level security;
alter table public.car_offers     enable row level security;
alter table public.ingestion_runs enable row level security;

-- Las políticas se crean solo si existen los roles de Supabase; así la misma
-- migración funciona también en un Postgres local sin esos roles.
do $$
declare
  t text;
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    foreach t in array array['flight_offers', 'hotel_offers', 'car_offers', 'ingestion_runs'] loop
      execute format('drop policy if exists catalog_read_only on public.%I', t);
      execute format(
        'create policy catalog_read_only on public.%I for select to anon, authenticated using (true)', t
      );
    end loop;
  end if;
end
$$;

-- Los esquemas de dominio no se exponen: se revoca cualquier acceso de los
-- roles públicos de Supabase (si existen).
do $$
declare
  s text;
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    foreach s in array array['flights', 'hotels', 'cars', 'billing', 'saga', 'identity'] loop
      execute format('revoke all on schema %I from anon, authenticated', s);
      execute format('revoke all on all tables in schema %I from anon, authenticated', s);
    end loop;
  end if;
end
$$;
