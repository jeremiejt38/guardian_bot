const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { CHANNELS, GRADE_NAMES } = require('../../config');
const { t } = require('../i18n');
const { replyEphemeral } = require('../utils/interactions');
const { findTextChannelByName } = require('../utils/channels');
const { configureSlowMode, getSlowModeConfig } = require('./autoMod');
const { getGradeMappings } = require('../initialisation/gradeMapping');

const IDS = Object.freeze({
  panel: 'automod:slowmode:panel',
  selectChannel: 'automod:slowmode:select',
  setModal: 'automod:slowmode:set:modal',
  setInput: 'automod:slowmode:set:input',
  disableAll: 'automod:slowmode:disable:all'
});

function hasOwnerGrade(member, guildId) {
  const mappings = getGradeMappings(guildId);
  const ownerRoleId = mappings[GRADE_NAMES.owner];
  return ownerRoleId && member.roles.cache.has(ownerRoleId);
}

function buildChannelSelectMenu(guild, guildId, page = 0) {
  const config = getSlowModeConfig(guildId);
  const textChannels = [...guild.channels.cache.values()]
    .filter((ch) => ch.isTextBased?.() && ch.name !== CHANNELS.setup)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!textChannels.length) return null;

  const options = textChannels.map((ch) => {
    const seconds = config[ch.id] || 0;
    return {
      label: `#${ch.name}`,
      description: seconds > 0 ? `${seconds}s slow mode actif` : 'Pas de slow mode',
      value: ch.id
    };
  });

  const { buildPaginatedSelect } = require('../utils/paginatedSelect');
  const { rows } = buildPaginatedSelect(
    options,
    IDS.selectChannel,
    t(guildId, 'automod.slowSelectPlaceholder'),
    page,
    { minValues: 1, maxValues: 1 }
  );
  return rows;
}

async function handleSlowModePage(interaction) {
  const { parsePaginatedCustomId } = require('../utils/paginatedSelect');
  const { targetPage } = parsePaginatedCustomId(interaction.customId);
  if (targetPage === null || Number.isNaN(targetPage)) return true;
  const rows = buildChannelSelectMenu(interaction.guild, interaction.guildId, targetPage);
  const components = [buildActionRow(interaction.guildId)];
  if (rows) components.unshift(...rows);
  await interaction.update({ content: buildPanelContent(interaction.guildId, interaction.guild), components });
  return true;
}

function buildPanelContent(guildId, guild) {
  const config = getSlowModeConfig(guildId);
  const active = Object.entries(config).filter(([, s]) => s > 0);

  let lines = [`**${t(guildId, 'automod.slowPanelTitle')}**\n`];
  if (active.length === 0) {
    lines.push(t(guildId, 'automod.slowNoneActive'));
  } else {
    for (const [channelId, seconds] of active) {
      const ch = guild.channels.cache.get(channelId);
      const name = ch ? `#${ch.name}` : channelId;
      lines.push(`• ${name} — **${seconds}s**`);
    }
  }
  lines.push(`\n${t(guildId, 'automod.slowSelectHint')}`);
  return lines.join('\n');
}

function buildActionRow(guildId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(IDS.disableAll)
      .setLabel(t(guildId, 'automod.slowDisableAll'))
      .setStyle(ButtonStyle.Danger)
  );
}

async function seedSlowModePanel(guild) {
  const channel = findTextChannelByName(guild, CHANNELS.autoModeration);
  if (!channel) return;

  const messages = await channel.messages.fetch({ limit: 10 }).catch(() => null);
  const hasPanel = messages?.some(
    (m) => m.author.id === guild.client.user.id &&
      m.components.length > 0 &&
      m.components[0]?.components?.[0]?.customId === IDS.panel
  );
  if (hasPanel) return;

  const guildId = guild.id;
  const selectRows = buildChannelSelectMenu(guild, guildId, 0);
  const components = [buildActionRow(guildId)];
  if (selectRows) components.unshift(...selectRows);

  await channel.send({
    content: buildPanelContent(guildId, guild),
    components
  }).catch(() => undefined);
}

async function handleSlowModeInteraction(interaction) {
  const { customId, guildId } = interaction;
  if (!customId?.startsWith('automod:slowmode:')) return false;

  if (!hasOwnerGrade(interaction.member, guildId)) {
    await replyEphemeral(interaction, t(guildId, 'automod.ownerOnly'));
    return true;
  }

  if (interaction.isButton() && customId.startsWith(`${IDS.selectChannel}:page:`)) {
    return handleSlowModePage(interaction);
  }

  if (interaction.isStringSelectMenu() && customId.startsWith(`${IDS.selectChannel}:`)) {
    const channelId = interaction.values[0];
    const ch = interaction.guild.channels.cache.get(channelId);
    if (!ch) {
      await replyEphemeral(interaction, t(guildId, 'automod.channelNotFound'));
      return true;
    }

    const modal = new ModalBuilder()
      .setCustomId(`${IDS.setModal}:${channelId}`)
      .setTitle(t(guildId, 'automod.slowSetModalTitle', { channel: ch.name }))
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(IDS.setInput)
            .setLabel(t(guildId, 'automod.slowSetInputLabel'))
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('0-21600')
            .setRequired(true)
            .setMaxLength(5)
        )
      );
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isModalSubmit() && customId.startsWith(`${IDS.setModal}:`)) {
    const channelId = customId.split(':').pop();
    const rawSeconds = interaction.fields.getTextInputValue(IDS.setInput).trim();
    const seconds = Number.parseInt(rawSeconds, 10);

    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) {
      await replyEphemeral(interaction, t(guildId, 'automod.slowInvalidValue'));
      return true;
    }

    const ch = interaction.guild.channels.cache.get(channelId);
    if (!ch) {
      await replyEphemeral(interaction, t(guildId, 'automod.channelNotFound'));
      return true;
    }

    await configureSlowMode(ch, seconds);

    const automodChannel = findTextChannelByName(interaction.guild, CHANNELS.autoModeration);
    if (automodChannel) {
      const selectRows = buildChannelSelectMenu(interaction.guild, guildId, 0);
      const components = [buildActionRow(guildId)];
      if (selectRows) components.unshift(...selectRows);
      await automodChannel.messages.fetch({ limit: 5 }).then(async (msgs) => {
        const panel = msgs.find(
          (m) => m.author.id === interaction.guild.client.user.id && m.components.length > 0
        );
        if (panel) {
          await panel.edit({ content: buildPanelContent(guildId, interaction.guild), components }).catch(() => undefined);
        }
      }).catch(() => undefined);
    }

    await replyEphemeral(interaction, t(guildId, 'automod.slowSetSuccess', { channel: ch.name, seconds: String(seconds) }));
    return true;
  }

  if (interaction.isButton() && customId === IDS.disableAll) {
    const config = getSlowModeConfig(guildId);
    for (const channelId of Object.keys(config)) {
      const ch = interaction.guild.channels.cache.get(channelId);
      if (ch) await configureSlowMode(ch, 0);
    }

    const automodChannel = findTextChannelByName(interaction.guild, CHANNELS.autoModeration);
    if (automodChannel) {
      const selectRows = buildChannelSelectMenu(interaction.guild, guildId, 0);
      const components = [buildActionRow(guildId)];
      if (selectRows) components.unshift(...selectRows);
      await automodChannel.messages.fetch({ limit: 5 }).then(async (msgs) => {
        const panel = msgs.find(
          (m) => m.author.id === interaction.guild.client.user.id && m.components.length > 0
        );
        if (panel) {
          await panel.edit({ content: buildPanelContent(guildId, interaction.guild), components }).catch(() => undefined);
        }
      }).catch(() => undefined);
    }

    await replyEphemeral(interaction, t(guildId, 'automod.slowDisabledAll'));
    return true;
  }

  return false;
}

module.exports = {
  IDS,
  seedSlowModePanel,
  handleSlowModeInteraction
};
