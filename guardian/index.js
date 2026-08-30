const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');
const { DISCORD_TOKEN } = require('./config');
const { initDatabase, migrateDatabase } = require('./database/db');
const logger = require('./modules/logs/logger');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.AutoModerationExecution
  ],
  partials: [Partials.Channel]
});

client.commands = new Collection();

function loadCommands() {
  const commandsPath = path.join(__dirname, 'commands');
  if (!fs.existsSync(commandsPath)) {
    return;
  }

  for (const file of fs.readdirSync(commandsPath).filter((fileName) => fileName.endsWith('.js'))) {
    const command = require(path.join(commandsPath, file));
    if (command?.data?.name && typeof command.execute === 'function') {
      client.commands.set(command.data.name, command);
    }
  }
}

function loadEvents() {
  const eventsPath = path.join(__dirname, 'events');
  for (const file of fs.readdirSync(eventsPath).filter((fileName) => fileName.endsWith('.js'))) {
    const event = require(path.join(eventsPath, file));
    if (!event?.name || typeof event.execute !== 'function') {
      continue;
    }

    if (event.once) {
      client.once(event.name, (...args) => event.execute(client, ...args));
    } else {
      client.on(event.name, (...args) => event.execute(client, ...args));
    }
  }
}

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection', { message: err?.message, stack: err?.stack });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { message: err?.message, stack: err?.stack });
});

(async () => {
  try {
    initDatabase();
    migrateDatabase();
    loadCommands();
    loadEvents();
    await client.login(DISCORD_TOKEN);
  } catch (error) {
    logger.error('Guardian bootstrap failed', error);
    process.exitCode = 1;
  }
})();
