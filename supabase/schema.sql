-- ════════════════════════════════════════════════
-- Misiones Pendientes — Schema Supabase
-- Ejecutar en SQL Editor antes de importar los CSV
-- ════════════════════════════════════════════════

create table if not exists personas (
  id          serial primary key,
  nombre      text not null unique,
  color       text,
  created_at  timestamptz default now()
);

create table if not exists misiones (
  id              text primary key,
  titulo          text not null,
  progreso        integer not null default 0 check (progreso between 0 and 100),
  prioridad       text not null check (prioridad in ('urgente','alta','media','baja')),
  persona         text references personas(nombre) on update cascade,
  fecha           date,
  hora            time,
  icono           text,
  timer_ends_at   timestamptz,
  timer_notified  boolean default false,
  reminder_min    integer default 60,
  created_at      timestamptz default now()
);

create table if not exists subtareas (
  id          text primary key default gen_random_uuid()::text,
  mision_id   text not null references misiones(id) on delete cascade,
  texto       text not null,
  completada  boolean default false,
  orden       integer default 0,
  created_at  timestamptz default now()
);

-- Índices útiles
create index if not exists idx_misiones_prioridad on misiones(prioridad);
create index if not exists idx_misiones_persona   on misiones(persona);
create index if not exists idx_misiones_fecha     on misiones(fecha);
create index if not exists idx_subtareas_mision   on subtareas(mision_id);

-- Row Level Security (opcional, actívalo si usas auth)
-- alter table misiones  enable row level security;
-- alter table subtareas enable row level security;
-- alter table personas  enable row level security;
