# 🛠️ Dev Setup — Guardian Discord Bot

## Prérequis

| Outil | Version minimale | Installation |
|---|---|---|
| Node.js | ≥ 22 (pour `node:sqlite` built-in) | [nodejs.org](https://nodejs.org) |
| npm | ≥ 9 | inclus avec Node |
| Git | — | [git-scm.com](https://git-scm.com) |

Vérification :
```bash
node -v   # v22.x ou supérieur
npm -v
git --version
```

---

## Cloner et installer

```bash
git clone https://github.com/jeremiejt38/guardian_bot.git
cd guardian_bot/guardian
npm install
```

---

## Configurer le `.env`

```bash
cp .env.example .env
```

Remplir les variables requises :

| Variable | Où la trouver |
|---|---|
| `DISCORD_TOKEN` | Discord Developer Portal → ton application → Bot → Token |
| `CLIENT_ID` | Discord Developer Portal → ton application → General Information → Application ID |
| `NODE_ENV` | `development` en local |
| `BOT_ADMIN_ID` | Ton ID Discord : Settings → Advanced → Developer Mode → clic droit sur ton profil → Copy ID |
| `DATABASE_PATH` | Laisser la valeur par défaut `./data/guardian.db` |

Variables optionnelles pour le développement :
| Variable | Utilité |
|---|---|
| `RAWG_API_KEY` | Enrichissement des jeux non-Steam — fonctionne sans |
| `SERVER_SECRETS_KEY` | Clé AES-256 pour chiffrement — auto-générée si absente |

---

## Serveur Discord de test

Créer un serveur Discord dédié aux tests (ne jamais tester sur le serveur de production).

### Créer l'application Discord

1. [Discord Developer Portal](https://discord.com/developers/applications) → New Application
2. Onglet **Bot** → Reset Token → copier dans `.env`
3. Onglet **Bot** → activer :
   - ✅ Server Members Intent
   - ✅ Message Content Intent
4. Onglet **OAuth2 → URL Generator** :
   - Scopes : `bot`, `applications.commands`
   - Bot Permissions : `Administrator` (en dev, simplifie les tests)
5. Copier l'URL générée et inviter le bot sur ton serveur de test

### Déployer les slash commands

```bash
cd guardian
npm run deploy:commands
```

> Les commandes peuvent prendre 1-2 minutes à apparaître sur Discord.

---

## Lancer le bot

```bash
# Mode watch (redémarre automatiquement à chaque modification)
npm run dev

# Mode normal
npm start
```

---

## Branches

| Branche | Usage |
|---|---|
| `dev` | Développement quotidien — travail ici par défaut |
| `beta` | Early access premium (Hetzner) |
| `main` | Stable — déclenche la release free |

```bash
# Toujours travailler sur dev
git checkout dev
```

---

## Workflow quotidien

```bash
# 1. Se mettre à jour
git checkout dev && git pull origin dev

# 2. Coder + tester localement

# 3. Commit
git add .
git commit -m "feat: description de la feature"

# 4. Push
git push origin dev

# 5. Passer en beta quand stable
git checkout beta && git merge dev && git push origin beta

# 6. Release (depuis main uniquement)
git checkout main && git merge beta
npm run release patch
```

---

## Serveur de test Discord recommandé

Créer ces channels manuellement pour tester toutes les features sans passer par le setup :

| Channel | Utilité |
|---|---|
| `#guardian-setup` | Setup wizard |
| `#general` | Canal principal |
| `#guardian-logs` | Logs Guardian |
| `#guardian-backup` | Backup BDD |

Ou laisser Guardian les créer via le setup wizard (recommandé pour tester l'install complète).

---

## Reset complet pour un nouveau test d'install

```bash
# Supprimer la BDD locale
rm guardian/data/guardian.db

# Relancer le bot
npm run dev
```

Puis sur Discord : utiliser `/setup` pour redémarrer le wizard depuis zéro.
