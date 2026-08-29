# 🔄 Workflow complet — Guardian Discord Bot

> Schéma du cycle de développement, déploiement et distribution.

---

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        REPO PRIVÉ (jeremiejt38/guardian_bot)        │
│                                                                             │
│   dev ──────────────────────────────────────────────────────────────────►  │
│    │   feature stable + testée en local                                     │
│    ▼                                                                        │
│   beta ─────────────────────────────────────────────────────────────────►  │
│    │   validée sur Hetzner + early access abonnés premium                   │
│    ▼                                                                        │
│   main ─────────────────────────────────────────────────────────────────►  │
│    │   npm run release patch/minor/major                                    │
│    │                                                                        │
│    ├──► GitHub Release privé (premium)                                      │
│    │    tag vX.Y.Z + changelog catégorisé                                   │
│    │                                                                        │
│    └──► Build free bundle ──────────────────────────────────────────────►  │
│         strip @premium-start/end + exclude discordSettings.js               │
│              │                                                              │
│              ├──► ZIP guardian-free-vX.Y.Z.zip                             │
│              │                                                              │
│              └──► REPO PUBLIC (jeremiejt38/guardian_bot_Free)      │
│                   ├─ git push code source strippé (main)                   │
│                   ├─ git tag vX.Y.Z                                        │
│                   ├─ GitHub Release + zip en asset                         │
│                   ├─ README.md (avec badges 🔒 features premium)           │
│                   ├─ LICENSE (propriétaire)                                │
│                   ├─ CONTRIBUTING.md (CLA implicite)                       │
│                   └─ SECURITY.md (politique divulgation)                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Branches

| Branche | Rôle | Push direct | Déploiement |
|---|---|---|---|
| `dev` | Développement quotidien | ✅ Oui | Local / serveur Discord test |
| `beta` | Early access premium | ✅ Oui | Hetzner (branche beta) |
| `main` | Stable — release officielle | ⚠️ Bypass admin uniquement | Hetzner (branche main) |

**Règle** : jamais de push direct sur `main` en dehors du script `release.js` et des hotfixes urgents.

---

## Flux de développement quotidien

```
1. git checkout dev
2. Coder + tester en local (serveur Discord de test)
3. git add . && git commit -m "feat: ..."
4. git push origin dev
```

---

## Passage en beta (early access premium)

```
git checkout beta
git merge dev
git push origin beta
# → déployer Hetzner depuis beta :
#   ssh hetzner "cd guardian_bot && git pull origin beta && pm2 restart guardian"
```

Les abonnés premium sur le serveur Hetzner voient les nouvelles features en avant-première.

---

## Release stable (déclenche la version free)

```
git checkout main
git merge beta
npm run release patch    # ou minor / major
```

### Ce que fait `npm run release` automatiquement

```
1.  Bump version dans guardian/package.json
2.  Met à jour le badge version dans README.md
3.  Insère une entrée dans le tableau Changelog de README.md
4.  Génère les release notes catégorisées (feat / fix / refactor / docs / chore)
5.  Commit "chore: bump version to vX.Y.Z"
6.  Crée et push le tag git annoté vX.Y.Z
7.  Crée la GitHub Release sur le repo privé (premium)
8.  Build le bundle free (strip @premium-start/end, exclude discordSettings.js)
9.  Génère le zip guardian-free-vX.Y.Z.zip
10. Clone Guardian_Discord_Bot_Free en local (dist/free-repo-tmp/)
11. Écrase le contenu avec le bundle strippé + fichiers légaux
12. Commit "release: vX.Y.Z" + tag sur le repo free
13. Push main + tags sur Guardian_Discord_Bot_Free
14. Crée la GitHub Release sur le repo free
15. Upload le zip comme asset téléchargeable
16. Nettoie dist/free-repo-tmp/
```

---

## Hotfix urgent (bug critique en production)

```
git checkout main
# fix minimal
git add . && git commit -m "fix: description du bug critique"
git push origin main
npm run release patch
# backporter ensuite sur beta et dev :
git checkout beta && git merge main && git push origin beta
git checkout dev && git merge main && git push origin dev
```

---

## Gestion des issues du repo free

Quand un bug est reporté sur `Guardian_Discord_Bot_Free` :

```
1. Issue ouverte sur le repo free (#N)
2. Tu développes le fix sur dev (repo privé)
3. Commit avec référence cross-repo :
   git commit -m "fix: description

   Fixes jeremiejt38/guardian_bot_Free#N"
4. Flow normal dev → beta → main → release
5. GitHub ferme automatiquement l'issue #N sur le repo free
```

---

## Gestion des contributions (PR sur le repo free)

```
1. Contributeur soumet une PR sur Guardian_Discord_Bot_Free
2. Tu lis la PR, tu testes le fix sur dev (repo privé)
3. Si pertinent, tu l'implémentes sur dev avec :
   git commit -m "fix: description

   Co-authored-by: PseudoContrib <email@example.com>
   Closes jeremiejt38/guardian_bot_Free#N"
4. Tu merges la PR sur le repo free (Option A — crédite le contributeur)
5. Flow normal dev → beta → main → release
```

---

## Sécurité — ce qui ne doit JAMAIS être dans un repo

| Fichier | Statut |
|---|---|
| `guardian/.env` | ❌ gitignored |
| `guardian/data/*.db` | ❌ gitignored |
| `dist/` | ❌ gitignored |
| `.aider*` | ❌ gitignored |
| `.env.*` (sauf `.env.example`) | ❌ gitignored |
| `GITHUB_FREE_RELEASE_TOKEN` | ❌ jamais dans le code, uniquement dans `.env` |

---

## Environnements

| Environnement | Repo | Branche | Utilisateurs |
|---|---|---|---|
| Local dev | Privé | `dev` | Jérémie seul |
| Hetzner beta | Privé | `beta` | Jérémie + abonnés early access |
| Hetzner stable | Privé | `main` | Tous les abonnés premium |
| Self-hosted free | Public | `main` (repo free) | Utilisateurs free |
