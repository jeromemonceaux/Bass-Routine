# Bass-Routine UI v1

- Projet: **Bass-Routine**
- Bibliothèque connectée à `/api/library` (Netlify Function + Supabase)
- Page principale: `index.html` (manche + outils en haut, visualisation de la grille en bas, bouton Random)
- Éditeur: `editor.html` (PATCH `/api/library/:id`)
- Mode de lecture infinie: retiré

## Intégration
1) Dépose tout à la **racine** du repo GitHub.
2) Netlify → Import from Git → Publish dir `/` (build vide).
3) Variables d'env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE` (ou `SUPABASE_KEY`).

## API
- `GET /api/library`
- `PUT /api/library`
- `PATCH /api/library/:id`
