# 🚀 Déploiement Hetzner — Guardian Discord Bot (Premium)

## Infrastructure recommandée

| Composant | Valeur |
|---|---|
| Serveur | Hetzner CX22 (2 vCPU, 4 GB RAM, 40 GB SSD) |
| OS | Ubuntu 24.04 LTS |
| Node.js | ≥ 22 |
| Process manager | PM2 |
| Branche déployée | `beta` (early access) ou `main` (stable) |

---

## Installation initiale

### 1. Connexion SSH

```bash
ssh root@<IP_HETZNER>
```

### 2. Installer Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # v22.x
```

### 3. Installer PM2

```bash
npm install -g pm2
```

### 4. Créer un utilisateur dédié (recommandé)

```bash
adduser guardian
usermod -aG sudo guardian
su - guardian
```

### 5. Cloner le repo

```bash
git clone https://github.com/jeremiejt38/guardian_bot.git
cd guardian_bot/guardian
npm install
```

### 6. Configurer le `.env`

```bash
cp .env.example .env
nano .env
```

Variables à renseigner :
```
NODE_ENV=production
DISCORD_TOKEN=<token_bot>
CLIENT_ID=<application_id>
DATABASE_PATH=./data/guardian.db
BOT_ADMIN_ID=<ton_id_discord>
```

### 7. Déployer les slash commands

```bash
npm run deploy:commands
```

### 8. Lancer avec PM2

```bash
pm2 start index.js --name guardian
pm2 save
pm2 startup   # copier-coller la commande affichée
```

---

## Mise à jour (mise à jour manuelle)

```bash
cd guardian_bot
git pull origin main   # ou beta selon l'environnement
cd guardian
npm install
pm2 restart guardian
```

### Mise à jour automatique depuis Discord

Guardian supporte l'auto-update via le panel admin DM.  
Le `BOT_ADMIN_ID` peut déclencher une mise à jour depuis Discord — le bot fait `git pull` + `npm install` + redémarre via PM2 automatiquement.

> PM2 **doit** être configuré avec `pm2 startup` pour que le redémarrage automatique fonctionne.

---

## Branches par environnement

| Environnement | Branche | Usage |
|---|---|---|
| Hetzner beta | `beta` | Early access premium, abonnés beta |
| Hetzner stable | `main` | Version stable officielle |

Pour basculer entre branches sur le serveur :
```bash
git checkout beta   # ou main
git pull
pm2 restart guardian
```

---

## Sauvegarde de la BDD

La BDD est dans `guardian/data/guardian.db`.

### Sauvegarde manuelle

```bash
cp guardian/data/guardian.db guardian/data/guardian.db.backup-$(date +%Y%m%d)
```

### Via Guardian

Guardian crée automatiquement des backups dans le channel `#guardian-backup` du serveur Discord. Le fichier SQLite est envoyé en pièce jointe chiffrée.

---

## Monitoring

```bash
pm2 status          # état des processus
pm2 logs guardian   # logs en temps réel
pm2 monit           # dashboard CPU/RAM
```

Les logs Guardian sont aussi disponibles dans le channel `#guardian-logs` du serveur Discord.

---

## Firewall (recommandé)

```bash
ufw allow ssh
ufw allow 80
ufw allow 443
ufw enable
```

Guardian n'expose aucun port HTTP — seul le port SSH est nécessaire.

---

## Variables d'environnement production

```
NODE_ENV=production
DISCORD_TOKEN=...
CLIENT_ID=...
DATABASE_PATH=./data/guardian.db
BOT_ADMIN_ID=...
RAWG_API_KEY=...         # optionnel
SERVER_SECRETS_KEY=...   # optionnel, auto-généré si absent
```

> Ne jamais mettre `GITHUB_FREE_RELEASE_TOKEN` sur Hetzner — ce token n'est utile que sur la machine de développement pour publier les releases.
