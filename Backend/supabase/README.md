# Schéma Supabase — pilotagebox

Base **mono-utilisateur** (Martin). Le schéma vit ici, versionné, pour ne plus être
un angle mort. Toute évolution = un nouveau fichier `migrations/NNNN_description.sql`.

## Modèle

| Table | Rôle |
|---|---|
| `projects` | un centre (métadonnées seulement) |
| `scenarios` | N sets de données complets et comparables. `dataset` (JSONB) = cockpit + réglages. 1 actif + variantes + scénarios verrouillés (budget initial) |
| `import_batches` | un lot = un fichier d'extract bancaire importé |
| `bank_transactions` | lignes bancaires : TTC signé + HT dérivé, signature, rattachement, statut |
| `categorization_rules` | mémoire de signatures persistante (pré-catégorisation auto) |

Principe :
- Un **scénario** est un set autonome complet (blob JSONB) → on les compare entre eux,
  ou un scénario au réel. Le "budget initial" = un scénario `is_locked`.
- Le **réel** est relationnel (agrégation par mois/catégorie) et rattaché au **projet**
  (partagé par tous les scénarios).
- Les cibles de rattachement (`target_id`) utilisent un **code stable** (les datasets
  étant clonés, un uuid de label ne serait pas stable entre scénarios).

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
