# Jazz Library — Netlify + Supabase (vDB-2)

Cette version ajoute :
- `PATCH /api/library/:id` → **upsert d’un seul morceau** (par id)
- La fonction accepte `SUPABASE_SERVICE_ROLE` **ou** `SUPABASE_KEY`
- L’éditeur a un bouton **Enregistrer (DB)** qui fait un `PATCH` de l’item courant

## API
- `GET /api/library` → JSON complet (ligne `id='default'` dans `libraries.data`)
- `PUT /api/library` → remplace le JSON complet
- `PATCH /api/library/:id` → upsert un item (merge) dans le JSON

### Schéma SQL (Supabase)
```sql
create table if not exists libraries (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

alter table libraries disable row level security;

insert into libraries (id, data)
values ('default', '[]'::jsonb)
on conflict (id) do nothing;
```

### Variables Netlify
- `SUPABASE_URL` = `https://<your>.supabase.co`
- `SUPABASE_SERVICE_ROLE` = **Service Role Key** (recommandé)  
  *(ou à défaut:* `SUPABASE_KEY` *→ peut être l’anon key si RLS off, moins sécurisé)*

## Dev local
```bash
npm i -g netlify-cli
npm i
netlify dev
```
