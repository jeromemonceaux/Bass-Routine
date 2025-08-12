# Jazz Library — Netlify + Supabase (GitHub mobile friendly)

## Files
- `index.html` (library UI)
- `editor.html` (editor UI)
- `netlify/functions/library.js` (API function GET/PUT/PATCH)
- `netlify.toml` (routes)
- `package.json`

## Netlify
- Create site: "Import from Git"
- Build command: (leave empty)
- Publish directory: `/`
- Env vars:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE` (or `SUPABASE_KEY`)

## Supabase (SQL)
```sql
create table if not exists libraries (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);
alter table libraries disable row level security;
insert into libraries (id, data) values ('default', '[]'::jsonb')
on conflict (id) do nothing;
```
