-- =============================================================================
-- 001 · Catálogo turístico (escrito por los workers de Dask)
--
-- Vive en el esquema `public` porque es el que pg_graphql expone. Así los
-- microservicios de Vuelos, Hoteles y Autos leen el catálogo con GraphQL nativo
-- de la base de datos (graphql.resolve) en vez de escribir SQL a mano.
-- =============================================================================

create extension if not exists pg_graphql;

-- Nombres en camelCase en GraphQL: flight_offers -> flightOffersCollection,
-- price_cop -> priceCop.
comment on schema public is e'@graphql({"inflect_names": true})';

-- -----------------------------------------------------------------------------
-- Vuelos (Google Flights). Precio = total de ida y vuelta por persona.
-- -----------------------------------------------------------------------------
create table if not exists public.flight_offers (
  id                  text primary key,          -- hash determinístico de la oferta
  search_key          text        not null,      -- BOG-CTG-2026-10-30-2026-11-02
  source              text        not null default 'google_flights',
  origin              text        not null,
  destination         text        not null,
  departure_date      date        not null,
  return_date         date        not null,
  airline             text        not null,
  operated_by         text,
  stops               integer     not null default 0,
  depart_time         text,
  arrive_time         text,
  duration_minutes    integer,
  origin_airport      text,
  destination_airport text,
  price_cop           integer     not null check (price_cop > 0),
  seats_available     integer     not null default 9 check (seats_available >= 0),
  is_active           boolean     not null default true,
  ingestion_run_id    text,
  scraped_at          timestamptz not null default now()
);
create index if not exists flight_offers_search_idx
  on public.flight_offers (search_key, is_active, price_cop);

-- -----------------------------------------------------------------------------
-- Hoteles (Google Hotels). Precio por noche y total de la estadía.
-- -----------------------------------------------------------------------------
create table if not exists public.hotel_offers (
  id                    text primary key,
  search_key            text        not null,
  source                text        not null default 'google_hotels',
  city_code             text        not null,
  city_name             text        not null,
  check_in              date        not null,
  check_out             date        not null,
  nights                integer     not null,
  name                  text        not null,
  price_per_night_cop   integer     not null check (price_per_night_cop > 0),
  total_price_cop       integer     not null check (total_price_cop > 0),
  rating                real,
  reviews               integer,
  stars                 integer,
  deal                  text,
  amenities             text,
  image_url             text,
  detail_url            text,
  rooms_available       integer     not null default 5 check (rooms_available >= 0),
  is_active             boolean     not null default true,
  ingestion_run_id      text,
  scraped_at            timestamptz not null default now()
);
create index if not exists hotel_offers_search_idx
  on public.hotel_offers (search_key, is_active, total_price_cop);

-- -----------------------------------------------------------------------------
-- Autos (Kayak). Precio total por los días de alquiler.
-- -----------------------------------------------------------------------------
create table if not exists public.car_offers (
  id                text primary key,
  search_key        text        not null,
  source            text        not null default 'kayak',
  pickup_code       text        not null,
  pickup_location   text,
  pickup_date       date        not null,
  dropoff_date      date        not null,
  days              integer     not null,
  model             text        not null,
  category          text,
  provider          text,
  total_price_cop   integer     not null check (total_price_cop > 0),
  passengers        integer,
  bags              integer,
  doors             text,
  transmission      text,
  score             real,
  image_url         text,
  units_available   integer     not null default 3 check (units_available >= 0),
  is_active         boolean     not null default true,
  ingestion_run_id  text,
  scraped_at        timestamptz not null default now()
);
create index if not exists car_offers_search_idx
  on public.car_offers (search_key, is_active, total_price_cop);

-- -----------------------------------------------------------------------------
-- Bitácora de corridas de ingesta (una fila por flow run de Prefect).
-- -----------------------------------------------------------------------------
create table if not exists public.ingestion_runs (
  id               text primary key,             -- id del flow run de Prefect
  flow_run_name    text,
  status           text        not null,         -- RUNNING | COMPLETED | PARTIAL | FAILED
  chaos_fail_rate  real        not null default 0,
  windows          integer     not null default 0,
  flights          integer     not null default 0,
  hotels           integer     not null default 0,
  cars             integer     not null default 0,
  failed_tasks     integer     not null default 0,
  detail           jsonb,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz
);
