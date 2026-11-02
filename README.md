# Nurikabe 塗

Jeu de logique Nurikabe (« peindre le mur » en japonais) pour Android, dans l'esthétique de la série : fond bleu nuit, encre blanc cassé, accents bordeaux.

## Installer l'application sur le téléphone

1. Sur ton téléphone, ouvre la page **Releases** de ce dépôt (colonne de droite sur GitHub, ou `…/nurikabe/releases`).
2. Dans la dernière version, touche le fichier `nurikabe-1.0.X.apk` pour le télécharger.
3. Ouvre le fichier téléchargé. Android demande d'autoriser l'installation depuis cette source : accepte, puis touche **Installer**.
4. Si Google Play Protect affiche un avertissement (« application inconnue »), choisis **Installer quand même**. C'est normal pour une appli qui ne vient pas du Play Store.

Les mises à jour s'installent par-dessus l'ancienne version sans perdre la partie en cours ni les records.

## Le jeu

- **Règles** : chaque nombre est une île dont il donne la taille ; chaque île contient un seul nombre et deux îles ne se touchent pas ; toutes les autres cases sont de la mer, d'un seul tenant et sans carré 2×2.
- **5 niveaux** : Facile 6×6, Moyen 7×7, Difficile 8×8, Expert 9×9, Maître 9×9 à grandes îles. Chaque grille est générée au hasard puis ajustée jusqu'à être résoluble par déductions, ce qui garantit une solution unique.
- **Niveau personnalisé** de 5×5 à 9×9 (les grilles plus grandes viendront avec un solveur plus puissant).
- **Commandes** : toucher une case la peint en mer, puis la marque comme terre (·), puis la vide ; glisser peint plusieurs cases. Les îles complètes se remplissent.
- **Indices progressifs** expliqués, vérifier, annuler, effacer, chrono, records, mode clair / sombre, zoom, sauvegarde automatique. Fonctionne hors connexion.

## Structure

- `src/` : sources de l'appli. `core.js` (noyau commun à la série : accueil, niveaux, zoom, indices, records, thème), `template.html`, les fichiers du jeu, `app.json` (nom, kanji). `python3 src/build.py` assemble `www/index.html` (APK, polices incluses) et `preview.html` (version web).
- `assets/` : icône et écran de démarrage (sources des images générées dans `android/`).
- `android/` : projet Android généré par Capacitor, signé avec une clé fixe pour que les mises à jour s'installent par-dessus.
- `.github/workflows/build-apk.yml` : compile l'APK et le publie dans les Releases à chaque modification sur `main` (ou à la demande depuis l'onglet **Actions**).

## Modifier l'appli

Modifier les fichiers de `src/`, lancer `python3 src/build.py`, puis tester dans un navigateur : servir le dossier `www/` (par exemple `python3 -m http.server` dans `www/`) et ouvrir la page en mode mobile.
