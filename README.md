
# Bass‑Routine (merge v2)

Ce pack intègre la bibliothèque Supabase + l’éditeur + le visualiseur “compas” dans ton projet.
- **index.html** : lecteur avec Random, recherche, métronome WebAudio, rendu compas (format standard), auto‑chargement de la DB, support `#grid=<id>`.
- **library.html** : bibliothèque (Importer JSON → Envoyer vers DB, Jouer, Ouvrir).
- **editor.html** : éditeur (pré-remplissage fiable par `?id=<id>`, insertion symboles, prévisualisation, PATCH DB).
- **js/grid** : moteur commun parse + render (sections, reprises, directives, multi-accords/mesure, tolérance de notation).
- **js/api** : client `/api/library` (fallback Blue Bossa si API KO).
- **netlify/functions/library.js** : fonction Web API (Response), CORS inclus.
- **netlify.toml** : redirections `/api/library`.

## Déploiement (GitHub → Netlify)
1. Upload **tout le contenu** de ce zip **à la racine** du repo GitHub (pas de sous-dossier en trop).
2. Netlify → Import from Git → Build command: *(vide)*, Publish directory: `/`.
3. Variables d’env : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE` (ou `SUPABASE_KEY`).
4. Teste : `/.netlify/functions/library` renvoie du JSON.

## Flux
- Bibliothèque : `library.html` → Charger DB → Jouer (ouvre `index.html#grid=<id>`) → Random/Recherche OK.
- Éditeur : `editor.html?id=<id>` → champs pré-remplis → Enregistrer (DB).
- Lecteur : affiche le nom de la grille, texte normalisé, rendu compas cohérent.

## À faire ensuite
- Brancher le “manche” réel à la zone `#fretboard`.
- Thème visuel final.
- (Optionnel) toggle numéros de mesure.
