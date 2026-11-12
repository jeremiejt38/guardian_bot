const { MessageFlags } = require('discord.js');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { t, describe } = require('../modules/i18n');
const { version } = require('../package.json');

const MODULES = [
  {
    key: 'setup',
    emoji: '🧙',
    color: 0x5865f2,
    commands: [
      { name: '/setup', desc: 'Lance le wizard de configuration Guardian (8 étapes).' }
    ],
    tips: [
      'Utilise le bouton **🔄 Rafraîchir** dans `#guardian` pour resynchroniser les panels.',
      'Tu peux relancer le wizard à tout moment depuis `#configuration → #guardian`.'
    ]
  },
  {
    key: 'members',
    emoji: '👥',
    color: 0x57f287,
    commands: [
      { name: '/parrainer', desc: 'Parrainer un invité pour accélérer sa promotion.' }
    ],
    tips: [
      'Les invités peuvent soumettre une demande de promotion dans `#demandes`.',
      'Le score comportemental augmente avec le temps et les bonnes interactions.'
    ]
  },
  {
    key: 'moderation',
    emoji: '🛡️',
    color: 0xed4245,
    commands: [
      { name: '/warn <membre> <raison>', desc: 'Émettre un avertissement.' },
      { name: '/mute <membre> <durée> <raison>', desc: 'Mettre en sourdine (ex: `1h`, `30m`).' },
      { name: '/kick <membre> <raison>', desc: 'Expulser un membre du serveur.' },
      { name: '/ban <membre> <raison>', desc: 'Bannir définitivement un membre.' },
      { name: '/historique <membre>', desc: 'Voir l\'historique complet des sanctions.' }
    ],
    tips: [
      'Toutes les sanctions sont journalisées dans `#logs-mod`.',
      'L\'anti-spam et la blacklist sont configurables dans `#guardian`.'
    ]
  },
  {
    key: 'games',
    emoji: '🎮',
    color: 0xfee75c,
    commands: [
      { name: '/config-games add <nom>', desc: 'Ajouter un jeu à la liste Guardian.' },
      { name: '/config-games remove <nom>', desc: 'Supprimer un jeu.' },
      { name: '/config-games list', desc: 'Lister les jeux configurés.' },
      { name: '/config-games set-steam <nom> <id>', desc: 'Définir le Steam AppID.' },
      { name: '/config-games toggle-changelog <nom>', desc: 'Activer/désactiver les mises à jour Steam.' },
      { name: '/config-games toggle-galerie <nom>', desc: 'Activer/désactiver la galerie.' },
      { name: '/config-games toggle-text <nom>', desc: 'Activer/désactiver le channel texte.' }
    ],
    tips: [
      'Le Steam ID se trouve dans l\'URL de la page du jeu sur Steam.',
      'Les salons vocaux temporaires se créent automatiquement dans `#créer-channel`.'
    ]
  },
  {
    key: 'notifications',
    emoji: '🔔',
    color: 0xeb459e,
    commands: [],
    tips: [
      'Les catégories de notifications DM sont configurables dans `#guardian`.',
      'Les notifications critiques (MAJ bot, erreurs) sont actives par défaut pour Owner et Manager.',
      '8 catégories disponibles : MAJ bot, erreur critique, setup incomplet, modération, nouveau membre, promotion, statut serveur, Steam.'
    ]
  },
  {
    key: 'servers',
    emoji: '🖥️',
    color: 0x9b59b6,
    commands: [],
    tips: [
      'Les membres peuvent proposer des serveurs de jeu dans `#serveurs`.',
      'L\'Owner/Manager valide ou rejette les propositions dans `#gestion-serveurs`.',
      'Le bot surveille automatiquement les serveurs approuvés et notifie les changements de statut.'
    ]
  },
  {
    key: 'config',
    emoji: '⚙️',
    color: 0x95a5a6,
    commands: [
      { name: '/langue <code>', desc: 'Changer la langue du bot (`fr`, `en`).' },
      { name: '/langues', desc: 'Lister les langues disponibles.' }
    ],
    tips: [
      'Le panel `#guardian` centralise toute la configuration.',
      'Utilise **Sync membres** pour importer les membres existants dans la BDD Guardian.'
    ]
  }
];

function buildOverviewEmbed(guildId) {
  const lines = MODULES.map((m) => {
    const cmdCount = m.commands.length;
    return `${m.emoji} **${t(guildId, `help.modules.${m.key}`)}** — ${cmdCount > 0 ? `${cmdCount} commande(s)` : 'panel Discord'}`;
  });

  return new EmbedBuilder()
    .setTitle(`🛡️ Guardian v${version} — Aide`)
    .setDescription(
      `${t(guildId, 'help.overviewDesc')}\n\n` +
      lines.join('\n') +
      `\n\n> Utilise \`/help module:<nom>\` pour le détail d'un module.`
    )
    .setColor(0x5865f2)
    .setFooter({ text: `Guardian v${version}` });
}

function buildModuleEmbed(guildId, moduleKey) {
  const mod = MODULES.find((m) => m.key === moduleKey);
  if (!mod) return null;

  const embed = new EmbedBuilder()
    .setTitle(`${mod.emoji} ${t(guildId, `help.modules.${mod.key}`)}`)
    .setColor(mod.color)
    .setFooter({ text: `Guardian v${version} — /help pour la vue générale` });

  if (mod.commands.length > 0) {
    embed.addFields({
      name: '📋 Commandes',
      value: mod.commands.map((c) => `\`${c.name}\`\n> ${c.desc}`).join('\n\n')
    });
  } else {
    embed.addFields({
      name: '📋 Commandes',
      value: '*Ce module se gère via les panels Discord.*'
    });
  }

  if (mod.tips.length > 0) {
    embed.addFields({
      name: '💡 Conseils',
      value: mod.tips.map((tip) => `• ${tip}`).join('\n')
    });
  }

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription(describe('commands.help.description'))
    .addStringOption((option) =>
      option
        .setName('module')
        .setDescription(describe('commands.help.moduleOption'))
        .setRequired(false)
        .addChoices(
          { name: '🧙 Setup', value: 'setup' },
          { name: '👥 Membres', value: 'members' },
          { name: '🛡️ Modération', value: 'moderation' },
          { name: '🎮 Jeux', value: 'games' },
          { name: '🔔 Notifications', value: 'notifications' },
          { name: '🖥️ Serveurs de jeu', value: 'servers' },
          { name: '⚙️ Configuration', value: 'config' }
        )
    ),
  async execute(interaction) {
    const guildId = interaction.guildId;
    const moduleKey = interaction.options.getString('module');

    if (moduleKey) {
      const embed = buildModuleEmbed(guildId, moduleKey);
      if (!embed) {
        await interaction.reply({ content: t(guildId, 'help.unknownModule'), flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ embeds: [buildOverviewEmbed(guildId)], flags: MessageFlags.Ephemeral });
    }
  }
};
