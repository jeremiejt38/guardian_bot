const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { CATEGORIES } = require('../../config');
const { getGuildSetting } = require('../config/settings');
const { findCategoryByName } = require('../utils/channels');
const { t } = require('../i18n');
const logger = require('../logs/logger');

const READ_ONLY_PERMS = [
  {
    id: null,
    allow: [PermissionFlagsBits.ViewChannel],
    deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads]
  }
];

const GUIDE_DEFINITIONS = [
  {
    key: 'getting-started',
    name: 'guide-demarrage',
    emoji: '🚀',
    title: (guildId) => t(guildId, 'guides.gettingStarted.title'),
    buildContent: (guild, guildId) => {
      const delay = getGuildSetting(guildId, 'members', 'promotion_delay_hours', 48);
      return [
        `# 🚀 ${t(guildId, 'guides.gettingStarted.title')}`,
        '',
        `## ${t(guildId, 'guides.gettingStarted.welcome')}`,
        t(guildId, 'guides.gettingStarted.intro', { guildName: guild.name }),
        '',
        `## 📋 ${t(guildId, 'guides.gettingStarted.readRulesTitle')}`,
        t(guildId, 'guides.gettingStarted.readRules'),
        '',
        `## ⏱️ ${t(guildId, 'guides.gettingStarted.bePatientTitle')}`,
        t(guildId, 'guides.gettingStarted.bePatient', { delay }),
        '',
        `## 🚀 ${t(guildId, 'guides.gettingStarted.becomeMemberTitle')}`,
        t(guildId, 'guides.gettingStarted.becomeMember'),
        '',
        `## 🎮 ${t(guildId, 'guides.gettingStarted.joinGamesTitle')}`,
        t(guildId, 'guides.gettingStarted.joinGames'),
        '',
        `-# *${t(guildId, 'guides.gettingStarted.footer')}*`
      ].join('\n');
    }
  },
  {
    key: 'membership',
    name: 'guide-promotion',
    emoji: '🏅',
    title: (guildId) => t(guildId, 'guides.membership.title'),
    buildContent: (guild, guildId) => {
      const delay = getGuildSetting(guildId, 'members', 'promotion_delay_hours', 48);
      const bioRequired = Boolean(getGuildSetting(guildId, 'members', 'bio_required', false));
      const sponsorshipRequired = Boolean(getGuildSetting(guildId, 'members', 'sponsorship_required', false));
      const rulesRequired = Boolean(getGuildSetting(guildId, 'members', 'rules_acceptance_required', true));

      const prereqs = [];
      if (rulesRequired) prereqs.push(t(guildId, 'guides.membership.prereqRules'));
      prereqs.push(t(guildId, 'guides.membership.prereqTime', { delay }));
      if (bioRequired) prereqs.push(t(guildId, 'guides.membership.prereqBio'));
      if (sponsorshipRequired) prereqs.push(t(guildId, 'guides.membership.prereqSponsor'));

      return [
        `# 🏅 ${t(guildId, 'guides.membership.title')}`,
        '',
        `## ${t(guildId, 'guides.membership.whatIsTitle')}`,
        t(guildId, 'guides.membership.whatIs'),
        '',
        `## ${t(guildId, 'guides.membership.prereqTitle')}`,
        prereqs.map((p) => `- ${p}`).join('\n'),
        '',
        `## ${t(guildId, 'guides.membership.howToTitle')}`,
        t(guildId, 'guides.membership.howTo').join('\n'),
        '',
        `-# *${t(guildId, 'guides.membership.footer')}*`
      ].join('\n');
    }
  },
  {
    key: 'sponsorship',
    name: 'guide-parrainage',
    emoji: '🤝',
    title: (guildId) => t(guildId, 'guides.sponsorship.title'),
    buildContent: (guild, guildId) => [
      `# 🤝 ${t(guildId, 'guides.sponsorship.title')}`,
      '',
      `## ${t(guildId, 'guides.sponsorship.whatIsTitle')}`,
      t(guildId, 'guides.sponsorship.whatIs'),
      '',
      `## ${t(guildId, 'guides.sponsorship.howGetTitle')}`,
      t(guildId, 'guides.sponsorship.howGet').map((l) => `- ${l}`).join('\n'),
      '',
      `## ${t(guildId, 'guides.sponsorship.howSponsorTitle')}`,
      t(guildId, 'guides.sponsorship.howSponsor').map((l) => `- ${l}`).join('\n'),
      '',
      `-# *${t(guildId, 'guides.sponsorship.footer')}*`
    ].join('\n')
  },
  {
    key: 'games',
    name: 'guide-jeux',
    emoji: '🎮',
    title: (guildId) => t(guildId, 'guides.games.title'),
    buildContent: (guild, guildId) => [
      `# 🎮 ${t(guildId, 'guides.games.title')}`,
      '',
      `## ${t(guildId, 'guides.games.howTitle')}`,
      t(guildId, 'guides.games.how'),
      '',
      `## ${t(guildId, 'guides.games.optInTitle')}`,
      t(guildId, 'guides.games.optIn').join('\n'),
      '',
      `## ${t(guildId, 'guides.games.suggestTitle')}`,
      t(guildId, 'guides.games.suggest'),
      '',
      `-# *${t(guildId, 'guides.games.footer')}*`
    ].join('\n')
  },
  {
    key: 'commands',
    name: 'guide-commandes',
    emoji: '⌨️',
    title: (guildId) => t(guildId, 'guides.commands.title'),
    buildContent: (guild, guildId) => [
      `# ⌨️ ${t(guildId, 'guides.commands.title')}`,
      '',
      `## ${t(guildId, 'guides.commands.memberTitle')}`,
      t(guildId, 'guides.commands.member').map((l) => `- ${l}`).join('\n'),
      '',
      `## ${t(guildId, 'guides.commands.staffTitle')}`,
      t(guildId, 'guides.commands.staff').map((l) => `- ${l}`).join('\n'),
      '',
      `## ${t(guildId, 'guides.commands.configTitle')}`,
      t(guildId, 'guides.commands.config'),
      '',
      `-# *${t(guildId, 'guides.commands.footer')}*`
    ].join('\n')
  }
];

async function ensureGuideCategory(guild) {
  const existing = findCategoryByName(guild, CATEGORIES.guides);
  if (existing) return existing;
  return guild.channels.create({
    name: CATEGORIES.guides,
    type: ChannelType.GuildCategory,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        allow: [PermissionFlagsBits.ViewChannel],
        deny: [PermissionFlagsBits.SendMessages]
      }
    ]
  });
}

async function seedGuideMessage(channel, content) {
  const messages = await channel.messages.fetch({ limit: 5 }).catch(() => null);
  const existing = messages?.find((m) => m.author.bot && m.content?.startsWith('#'));
  if (existing) {
    if (existing.content !== content) {
      await existing.edit(content).catch(() => {});
    }
    return existing;
  }
  return channel.send(content).catch(() => null);
}

async function createCommunityGuides(guild) {
  const guildId = guild.id;
  const category = await ensureGuideCategory(guild);
  const readOnlyPerms = READ_ONLY_PERMS.map((p) => ({ ...p, id: guild.roles.everyone.id }));

  const createdChannels = [];

  for (const def of GUIDE_DEFINITIONS) {
    let ch = guild.channels.cache.find(
      (c) => c.parentId === category.id && c.name === def.name && c.type === ChannelType.GuildText
    );
    if (!ch) {
      ch = await guild.channels.create({
        name: def.name,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: readOnlyPerms,
        topic: `${def.emoji} ${def.title(guildId)} — Guardian Guide`
      }).catch((err) => {
        logger.warn(`serverGuides: failed to create #${def.name} — ${err.message}`);
        return null;
      });
    } else {
      await ch.permissionOverwrites.set(readOnlyPerms).catch(() => {});
      await ch.edit({ topic: `${def.emoji} ${def.title(guildId)} — Guardian Guide` }).catch(() => {});
    }

    if (ch) {
      const content = def.buildContent(guild, guildId);
      await seedGuideMessage(ch, content);
      createdChannels.push(ch);
    }
  }

  return createdChannels;
}

async function createForumGuides(guild) {
  const guildId = guild.id;
  const category = await ensureGuideCategory(guild);
  const readOnlyPerms = READ_ONLY_PERMS.map((p) => ({ ...p, id: guild.roles.everyone.id }));
  const isCommunity = guild.features?.includes('COMMUNITY') ?? false;

  if (!isCommunity) {
    const createdChannels = [];
    for (const def of GUIDE_DEFINITIONS) {
      let ch = guild.channels.cache.find(
        (c) => c.parentId === category.id && c.name === def.name && c.type === ChannelType.GuildText
      );
      if (!ch) {
        ch = await guild.channels.create({
          name: def.name,
          type: ChannelType.GuildText,
          parent: category.id,
          permissionOverwrites: readOnlyPerms,
          topic: `${def.emoji} ${def.title(guildId)} — Guardian Guide`
        }).catch((err) => {
          logger.warn(`serverGuides: failed to create #${def.name} — ${err.message}`);
          return null;
        });
      } else {
        await ch.permissionOverwrites.set(readOnlyPerms).catch(() => {});
        await ch.edit({ topic: `${def.emoji} ${def.title(guildId)} — Guardian Guide` }).catch(() => {});
      }
      if (ch) {
        const content = def.buildContent(guild, guildId);
        await seedGuideMessage(ch, content);
        createdChannels.push(ch);
      }
    }
    return createdChannels;
  }

  for (const def of GUIDE_DEFINITIONS) {
    let forum = guild.channels.cache.find(
      (c) => c.parentId === category.id && c.name === def.name && c.type === ChannelType.GuildForum
    );
    if (!forum) {
      forum = await guild.channels.create({
        name: def.name,
        type: ChannelType.GuildForum,
        parent: category.id,
        permissionOverwrites: readOnlyPerms,
        topic: `${def.emoji} ${def.title(guildId)} — Guardian Guide`
      }).catch((err) => {
        logger.warn(`serverGuides: failed to create forum #${def.name} — ${err.message}`);
        return null;
      });
    } else {
      await forum.permissionOverwrites.set(readOnlyPerms).catch(() => {});
      await forum.edit({ topic: `${def.emoji} ${def.title(guildId)} — Guardian Guide` }).catch(() => {});
    }

    if (forum) {
      const threads = await forum.threads.fetchActive().catch(() => null);
      const existingThread = threads?.threads?.find((t) => t.name === def.title(guildId));
      if (!existingThread) {
        const content = def.buildContent(guild, guildId);
        await forum.threads.create({
          name: def.title(guildId),
          message: { content }
        }).catch((err) => logger.warn(`serverGuides: failed to create thread "${def.title(guildId)}" — ${err.message}`));
      }
    }
  }
}

async function patchOnboardingDefaultChannels(guild, channelIds) {
  try {
    const current = await guild.fetchOnboarding().catch(() => null);
    if (!current) return false;

    const existing = (current.defaultChannels || []).filter(Boolean).map((c) => c.id);
    const validIds = [];
    const everyone = guild.roles.everyone;
    if (!everyone) {
      logger.warn(`serverGuides: everyone role missing for guild ${guild.id}`);
      return false;
    }

    for (const id of [...new Set(channelIds)]) {
      const channel = guild.channels.cache.get(id);
      if (!channel) continue;
      const perms = channel.permissionsFor(everyone);
      if (perms?.has(PermissionFlagsBits.ViewChannel)) {
        validIds.push(id);
      } else {
        try {
          await channel.permissionOverwrites.create(everyone, { ViewChannel: true });
          validIds.push(id);
        } catch (err) {
          logger.warn(`serverGuides: cannot grant ViewChannel to @everyone for guide channel ${id}: ${err.message}`);
        }
      }
    }

    if (validIds.length === 0) return false;

    const merged = [...new Set([...existing, ...validIds])];

    await guild.client.rest.put(`/guilds/${guild.id}/onboarding`, {
      body: { default_channel_ids: merged, enabled: true }
    });

    logger.info(`serverGuides: patched onboarding default_channel_ids for guild ${guild.id} — added ${validIds.length} guide channels`);
    return true;
  } catch (err) {
    logger.warn(`serverGuides: patchOnboarding failed for guild ${guild.id} — ${err.message}`);
    return false;
  }
}

async function notifyOwnerToAddGuides(guild, channels) {
  const ownerId = getGuildSetting(guild.id, 'setup', 'owner_id', null) ?? guild.ownerId;
  const owner = await guild.client.users.fetch(ownerId).catch(() => null);
  if (!owner) return;

  const list = channels.map((c) => `- **#${c.name}** (<#${c.id}>)`).join('\n');

  await owner.send([
    `## 📚 Guardian — Guide channels created on **${guild.name}**`,
    '',
    'Guardian has created the following guide channels in the **📚 Guides** category:',
    list,
    '',
    '### Add them to the Server Guide',
    'To make these guides visible in the Discord Server Guide (sidebar):',
    '1. Go to **Server Settings → Community → Server Guide**',
    '2. Add each channel listed above as a resource',
    '',
    '-# *This message was sent because Guardian could not automatically configure the Server Guide (insufficient permissions or unsupported server type).*'
  ].join('\n')).catch(() => {});
}

async function seedGuidesChannels(guild) {
  const enabled = getGuildSetting(guild.id, 'guides', 'enabled', true);
  if (!enabled) return;

  const isCommunity = guild.features?.includes('COMMUNITY') ?? false;

  try {
    if (isCommunity) {
      const channels = await createCommunityGuides(guild);
      if (channels.length > 0) {
        const channelIds = channels.map((c) => c.id);
        const patched = await patchOnboardingDefaultChannels(guild, channelIds);
        if (!patched) {
          await notifyOwnerToAddGuides(guild, channels);
        }
      }
    } else {
      await createForumGuides(guild);
    }
  } catch (err) {
    logger.error(`seedGuidesChannels failed for guild ${guild.id}`, err);
  }
}

module.exports = { seedGuidesChannels, GUIDE_DEFINITIONS };
