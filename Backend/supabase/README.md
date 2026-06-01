# Schéma Supabase — pilotagebox

Base **mono-utilisateur** (Martin). Le schéma vit ici, versionné, pour ne plus être
un angle mort. Toute évolution = un nouveau fichier `migrations/NNNN_description.sql`.

## Modèle

| Table | Rôle |
|---|---|
| `projects` | un centre. `cockpit_state` (JSONB) = tout le cockpit (ex-localStorage) |
| `budget_snapshots` | photo figée du cockpit ("budget initial") pour comparer réel vs projeté |
| `import_batches` | un lot = un fichier d'extract bancaire importé |
| `bank_transactions` | lignes bancaires : TTC signé + HT dérivé, signature, rattachement, statut |
| `categorization_rules` | mémoire de signatures persistante (pré-catégorisation auto) |

Principe : le **cockpit** est un blob JSONB (chargé/sauvé d'un bloc), le **réel** est
relationnel (agrégation par mois/catégorie). Les cibles de rattachement (`target_id`)
pointent vers les labels/catégories qui vivent dans `cockpit_state`.

## Appliquer les migrations

**Option A — Dashboard Supabase (le plus simple)**
1. Dashboard → SQL Editor
2. Coller le contenu de `0001_init_cockpit.sql`, exécuter
3. Idem `0002_bank_reconciliation.sql`

**Option B — Supabase CLI**
```bash
supabase link --project-ref <ref>
supabase db push
```

## RLS

Mono-utilisateur : policy unique "authenticated full access" sur chaque table.
La base n'est donc accessible qu'avec un compte authentifié (pas ouverte publiquement),
mais sans cloisonnement par utilisateur puisqu'il n'y en a qu'un.

## Variables d'environnement (backend Railway)

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...   # côté serveur uniquement, jamais exposée au front
```

Le front (Lovable) utilise l'URL + l'anon key via l'intégration native Supabase.
