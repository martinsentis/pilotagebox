-- =====================================================================
-- Migration 0001 — Fondations cockpit
-- pilotagebox — base mono-utilisateur (Martin)
-- Le cockpit (charges, phases, hypothèses) est stocké tel quel en JSONB :
-- on charge/sauvegarde le projet entier d'un bloc, comme l'ancien localStorage.
-- =====================================================================

-- gen_random_uuid() est fourni par pgcrypto (activé par défaut sur Supabase)

-- ---------------------------------------------------------------------
-- projects : un projet = un centre de self-storage (ex: AlloBox)
-- cockpit_state contient TOUT l'état du cockpit (l'ancien MultiProjectState)
-- ---------------------------------------------------------------------
create table if not exists projects (
  id            uuid primary key default gen_random_uuid(),
  nom           text not null,
  cockpit_state jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- budget_snapshots : photo figée du cockpit ("budget initial")
-- Sert de référence pour comparer réel vs projeté. Pas de versioning continu :
-- on crée une photo ponctuelle quand on veut figer un budget.
-- ---------------------------------------------------------------------
create table if not exists budget_snapshots (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  label         text not null default 'Budget initial',
  cockpit_state jsonb not null,         -- copie figée du cockpit au moment du snapshot
  created_at    timestamptz not null default now()
);

create index if not exists idx_budget_snapshots_project on budget_snapshots(project_id);

-- ---------------------------------------------------------------------
-- updated_at auto sur projects
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

-- ---------------------------------------------------------------------
-- RLS — mono-utilisateur : tout utilisateur authentifié a accès total.
-- (Pas de cloisonnement par user : il n'y a qu'un compte.)
-- ---------------------------------------------------------------------
alter table projects         enable row level security;
alter table budget_snapshots enable row level security;

drop policy if exists "authenticated full access" on projects;
create policy "authenticated full access" on projects
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on budget_snapshots;
create policy "authenticated full access" on budget_snapshots
  for all to authenticated using (true) with check (true);
