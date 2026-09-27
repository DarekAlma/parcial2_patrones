-- =============================================================================
-- 002 · Esquemas por microservicio (database-per-service lógico)
--
-- Cada microservicio es dueño exclusivo de su esquema. Ninguno lee las tablas
-- de otro: se comunican solo por HTTP. Supabase aloja todos los esquemas en el
-- mismo proyecto Postgres, pero el aislamiento es de responsabilidad.
-- =============================================================================

-- ---------------------------------------------------------------- Vuelos ----
create schema if not exists flights;
create table if not exists flights.reservations (
  id            uuid primary key default gen_random_uuid(),
  saga_id       uuid        not null unique,     -- idempotencia: 1 reserva por saga
  offer_id      text        not null references public.flight_offers(id),
  passengers    integer     not null check (passengers > 0),
  status        text        not null check (status in ('RESERVED', 'CANCELLED')),
  created_at    timestamptz not null default now(),
  cancelled_at  timestamptz
);

-- --------------------------------------------------------------- Hoteles ----
create schema if not exists hotels;
create table if not exists hotels.reservations (
  id            uuid primary key default gen_random_uuid(),
  saga_id       uuid        not null unique,
  offer_id      text        not null references public.hotel_offers(id),
  guests        integer     not null check (guests > 0),
  status        text        not null check (status in ('RESERVED', 'CANCELLED')),
  created_at    timestamptz not null default now(),
  cancelled_at  timestamptz
);

-- ----------------------------------------------------------------- Autos ----
create schema if not exists cars;
create table if not exists cars.reservations (
  id            uuid primary key default gen_random_uuid(),
  saga_id       uuid        not null unique,
  offer_id      text        not null references public.car_offers(id),
  status        text        not null check (status in ('RESERVED', 'CANCELLED')),
  created_at    timestamptz not null default now(),
  cancelled_at  timestamptz
);

-- ---------------------------------------------------- Órdenes/Facturación ----
create schema if not exists billing;
create table if not exists billing.orders (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid        not null,
  status            text        not null default 'PENDING'
                    check (status in ('PENDING', 'PROCESSING', 'CONFIRMED', 'COMPENSATED', 'FAILED')),
  search_key        text        not null,
  flight_offer_id   text        not null,
  hotel_offer_id    text        not null,
  car_offer_id      text        not null,
  travelers         integer     not null check (travelers between 1 and 9),
  flight_total_cop  integer     not null,
  hotel_total_cop   integer     not null,
  car_total_cop     integer     not null,
  total_cop         integer     not null,
  simulate_failure  text        not null default 'NONE',
  failure_reason    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists orders_user_idx on billing.orders (user_id, created_at desc);

create table if not exists billing.payments (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid        not null unique references billing.orders(id),
  amount_cop   integer     not null,
  status       text        not null check (status in ('CHARGED', 'REFUNDED')),
  created_at   timestamptz not null default now(),
  refunded_at  timestamptz
);

create sequence if not exists billing.invoice_seq start 1000;
create table if not exists billing.invoices (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid        not null unique references billing.orders(id),
  number      text        not null unique,
  amount_cop  integer     not null,
  issued_at   timestamptz not null default now()
);

-- ------------------------------------------------ Orquestador de la SAGA ----
create schema if not exists saga;
create table if not exists saga.executions (
  order_id     uuid primary key,
  flow_run_id  text,
  status       text        not null,     -- RUNNING | COMPLETED | COMPENSATED | FAILED
  started_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create table if not exists saga.steps (
  id          bigserial primary key,
  order_id    uuid        not null,
  step        text        not null,     -- FLIGHT | HOTEL | CAR | PAYMENT | CONFIRMATION
  action      text        not null check (action in ('EXECUTE', 'COMPENSATE')),
  status      text        not null,     -- RUNNING | SUCCESS | FAILED | COMPENSATED
  detail      jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists saga_steps_order_idx on saga.steps (order_id, id);

-- ---------------------------------------------- Identidad (API Gateway) ----
-- Se usa `identity` y no `auth` para no chocar con el esquema interno de Supabase.
create schema if not exists identity;
create table if not exists identity.users (
  id             uuid primary key default gen_random_uuid(),
  email          text        not null unique,
  full_name      text        not null,
  password_hash  text        not null,         -- Argon2id (PHC string)
  created_at     timestamptz not null default now(),
  last_login_at  timestamptz
);

-- Almacén de sesiones de express-session (connect-pg-simple).
create table if not exists identity.session (
  sid     varchar      not null primary key,
  sess    json         not null,
  expire  timestamp(6) not null
);
create index if not exists identity_session_expire_idx on identity.session (expire);
