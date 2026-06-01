-- =====================================================================
-- Migration 0001 — Projets & scénarios
-- pilotagebox — base mono-utilisateur (Martin)
--
-- Un projet = un centre de self-storage (ex: AlloBox).
-- Un scénario = un SET DE DONNÉES COMPLET et autonome (parc, services, charges,
-- hypothèses d'évolution, événements de tréso, calcul du loyer, gouvernance,
-- fiscalité + réglages de scénario), stocké en JSONB.
-- On compare des scénarios entre eux, ou un scénario au réel.
-- Le "budget initial" est simplement un scénario verrouillé (is_locked).
-- =====================================================================

-- ---------------------------------------------------------------------
-- projects : le centre (métadonnées seulement ; les données sont dans scenarios)
-- ---------------------------------------------------------------------
create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- scenarios : N sets de données comparables par projet
-- dataset = l'intégralité du cockpit + réglages (ex-MultiProjectState + ScenarioState)
-- Création d'un scénario = clone d'un existant ("duplicate then edit").
-- ---------------------------------------------------------------------
create table if not exists scenarios (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  label       text not null,
  dataset     jsonb not null default '{}'::jsonb,   -- set de données complet et autonome
  is_active   boolean not null default false,       -- le scénario courant édité (working)
  is_locked   boolean not null default false,       -- figé (ex: "Budget initial", variante archivée)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_scenarios_project on scenarios(project_id);

-- Un seul scénario actif par projet
create unique index if not exists uniq_active_scenario_per_project
  on scenarios(project_id) where is_active;

-- ---------------------------------------------------------------------
-- updated_at auto
-- ---------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_projects_updated_at on projects;
create trigger trg_projects_updated_at
  before update on projects
  for each row execute function set_updated_at();

drop trigger if exists trg_scenarios_updated_at on scenarios;
create trigger trg_scenarios_updated_at
  before update on scenarios
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- RLS — mono-utilisateur : authentifié = accès total.
-- ---------------------------------------------------------------------
alter table projects  enable row level security;
alter table scenarios enable row level security;

drop policy if exists "authenticated full access" on projects;
create policy "authenticated full access" on projects
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on scenarios;
create policy "authenticated full access" on scenarios
  for all to authenticated using (true) with check (true);
