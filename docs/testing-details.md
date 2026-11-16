# 🧪 Tests — Guardian Discord Bot

> La source de vérité canonique pour la validation KSP est [`docs/TESTING.md`](./TESTING.md). Ce fichier documente le détail de la suite de tests.

## Lancer les tests

```bash
cd guardian
npm test
```

Résultat attendu :
```
# tests 103
# pass  103
# fail  0
```

---

## Structure des tests

Tous les tests sont dans `guardian/tests/`.

### Tests unitaires

| Fichier | Module testé |
|---|---|
| `behavior.test.js` | Score comportemental |
| `channels.test.js` | Utilitaires channels |
| `checkInstall.test.js` | Détection installation existante |
| `configBackup.test.js` | Export / import BDD |
| `configGames.test.js` | Panel configuration jeux |
| `database.test.js` | Init BDD, migrations |
| `db.test.js` | Helpers setConfig / getConfig |
| `gameList.test.js` | Liste jeux paginée |
| `gameRequests.test.js` | Demandes d'ajout de jeux |
| `gamesNotification.test.js` | Changelogs Steam |
| `gamesVocal.test.js` | Vocaux temporaires |
| `gradeMapping.test.js` | Mapping grades ↔ rôles |
| `i18n.test.js` | Traductions |
| `logger.test.js` | Logger structuré |
| `members.test.js` | Onboarding membres |
| `modLog.test.js` | Logs modération |
| `moderation.test.js` | Sanctions |
| `parrainage.test.js` | Système parrainage |
| `permissions.test.js` | Vérifications permissions Discord |
| `promotionRequest.test.js` | Demandes de promotion |
| `rateLimit.test.js` | Rate limiting |
| `reports.test.js` | Signalements |
| `roles.test.js` | Gestion rôles |
| `scheduling.test.js` | Tâches planifiées |
| `secrets.test.js` | Chiffrement AES-256 |
| `seeds.test.js` | Création channels/catégories |
| `serverGamesManager.test.js` | Gestionnaire jeux serveur |
| `serverMonitor.test.js` | Monitoring serveurs jeu |
| `servers.test.js` | Serveurs communautaires |
| `settings.test.js` | guild_config helpers |
| `setup.test.js` | Commande setup |
| `setupFlow.test.js` | Wizard steps / handlers |
| `setupMessages.test.js` | Messages du setup |

### Tests E2E

| Fichier | Scénario |
|---|---|
| `e2e.test.js` | 6 flows complets (install, promotion, parrainage, modération, jeux, vocaux) |

---

## Écrire un test

Les tests utilisent le module built-in `node:test` de Node.js — **aucune dépendance externe**.

### Template de base

```js
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

// Mock de la BDD en mémoire
const { initDatabase } = require('../database/db');

describe('monModule', () => {
  before(() => {
    initDatabase(':memory:');
  });

  it('should do something', () => {
    const result = maFonction(42);
    assert.strictEqual(result, 42);
  });

  it('should handle edge case', () => {
    assert.throws(() => maFonction(null), /expected error/);
  });
});
```

### BDD en mémoire

Toujours utiliser `:memory:` pour les tests — jamais le fichier `guardian.db` :

```js
before(() => {
  initDatabase(':memory:');
  // optionnel si la BDD doit être propre entre les tests :
  const db = getDb();
  db.exec('DELETE FROM members');
});
```

### Mocker Discord.js

Guardian n'utilise pas de framework de mock. Les tests unitaires évitent les appels Discord en passant des objets guild/interaction factices :

```js
const mockGuild = {
  id: '123456789',
  channels: { cache: new Map() },
  roles: { cache: new Map() },
  features: []
};

const mockInteraction = {
  guildId: '123456789',
  guild: mockGuild,
  customId: 'setup:next',
  deferUpdate: async () => {},
  message: { edit: async () => {} }
};
```

---

## Règles

- **Ne jamais supprimer ou affaiblir un test existant** sans raison explicite
- **Ajouter un test** pour chaque nouveau module ou fonction critique
- **Les tests E2E** couvrent les flows complets — les mettre à jour si le flow change
- **Toujours vérifier** que `npm test` passe avant de merger sur `beta` ou `main`

---

## CI (à venir)

Pour l'instant les tests tournent manuellement. À terme, un workflow GitHub Actions sur `beta` et `main` lancera `npm test` automatiquement avant chaque merge.
