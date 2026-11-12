const { MessageFlags } = require('discord.js');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getGuildSetting } = require('../modules/config/settings');
const { getGradeMappings, ORDERED_GRADES } = require('../modules/initialisation/gradeMapping');
const { getCurrentStep } = require('../modules/initialisation/setupGrades');
const { CHANNEL_SLOTS } = require('../modules/initialisation/setupSteps');
const { isPremiumFeatureEnabled } = require('../modules/tier/premiumGateUI');
const { listSetupGames } = require('../modules/initialisation/setupGames');
const { version } = require('../package.json');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('status')
		.setDescription('Affiche l\'état de la configuration du serveur'),
	async execute(interaction) {
		// Vérification des permissions
		if (!interaction.member.permissions.has('ManageGuild')) {
			await interaction.reply({
				content: 'Vous n\'avez pas la permission de gérer le serveur.',
				flags: MessageFlags.Ephemeral
			});
			return;
		}

		// Vérification si l'utilisateur est le bot admin
		if (interaction.user.id === process.env.BOT_ADMIN_ID) {
			await interaction.reply({
				content: 'Le bot admin ne peut pas utiliser cette commande.',
				flags: MessageFlags.Ephemeral
			});
			return;
		}

		const guildId = interaction.guild.id;
		const guild = interaction.guild;

		// Récupération des données
		const gradeMappings = getGradeMappings(guildId);
		const currentStep = getCurrentStep(guildId);
		const isPremiumGuild = isPremiumFeatureEnabled(guildId);
		const setupGames = listSetupGames(guildId);

		// Construction de l'embed
		const embed = new EmbedBuilder()
			.setColor(0x5865f2)
			.setTitle(`État de la configuration — ${guild.name}`)
			.setFooter({
				text: `Guardian v${version} • Visible uniquement par vous`
			});

		// Field Grades
		let gradesField = '';
		for (const grade of ORDERED_GRADES) {
			const role = gradeMappings[grade];
			if (role) {
				gradesField += `${grade}: <@&${role}>\n`;
			} else {
				gradesField += `${grade}: Non mappé\n`;
			}
		}
		embed.addFields({
			name: 'Grades',
			value: gradesField,
			inline: false
		});

		// Field Invite mode
		const inviteMode = getGuildSetting(guildId, 'setup', 'invite_mode', 'classic');
		embed.addFields({
			name: 'Mode d\'invitation',
			value: inviteMode,
			inline: true
		});

		// Field Modules
		const moduleKeys = [
			{ key: 'suggestions_enabled',  label: 'Suggestions',    ns: 'channels', def: true  },
			{ key: 'server_list_enabled',  label: 'Server list',    ns: 'channels', def: false },
			{ key: 'status_bot_enabled',   label: 'Status bot',     ns: 'channels', def: true  },
			{ key: 'afk_enabled',          label: 'AFK',            ns: 'channels', def: true  },
			{ key: 'game_updates_enabled', label: 'Game updates',   ns: 'channels', def: true  },
			{ key: 'enabled',              label: 'Guides',         ns: 'guides',   def: true  },
		];
		let modulesField = '';
		for (const mod of moduleKeys) {
			const isEnabled = getGuildSetting(guildId, mod.ns, mod.key, mod.def);
			modulesField += `${isEnabled ? '✅' : '❌'} ${mod.label}\n`;
		}
		embed.addFields({
			name: 'Modules',
			value: modulesField,
			inline: false
		});

		// Field Channels
		let channelsField = '';
		for (const slot of CHANNEL_SLOTS) {
			const channelId = getGuildSetting(guildId, 'channels', slot.key + '_channel_id', null);
			if (channelId) {
				channelsField += `${slot.label}: <#${channelId}>\n`;
			} else {
				channelsField += `${slot.label}: Non configuré\n`;
			}
		}
		embed.addFields({
			name: 'Canaux',
			value: channelsField,
			inline: false
		});

		// Field Membres
		const promotionDelay = getGuildSetting(guildId, 'members', 'promotion_delay_hours', 0);
		const bioRequired = getGuildSetting(guildId, 'members', 'bio_required', false);
		const sponsorshipRequired = getGuildSetting(guildId, 'members', 'sponsorship_required', false);
		const inviteExpulsionEnabled = getGuildSetting(guildId, 'members', 'invite_expulsion_enabled', false);
		const inviteExpulsionDays = getGuildSetting(guildId, 'members', 'invite_expulsion_days', 0);

		let membersField = '';
		membersField += `Délai de promotion: ${promotionDelay} heures\n`;
		membersField += `Bio requise: ${bioRequired ? 'Oui' : 'Non'}\n`;
		membersField += `Parrainage requis: ${sponsorshipRequired ? 'Oui' : 'Non'}\n`;
		membersField += `Expulsion d'invitation: ${inviteExpulsionEnabled ? 'Oui' : 'Non'} (${inviteExpulsionDays} jours)\n`;

		embed.addFields({
			name: 'Membres',
			value: membersField,
			inline: false
		});

		// Field Jeux
		const gameCount = setupGames.length;
		embed.addFields({
			name: 'Jeux',
			value: `${gameCount} jeux configurés`,
			inline: true
		});

		// Field Setup
		let setupStep = '';
		if (currentStep < 9) {
			setupStep = `Étape ${currentStep}/9`;
		} else {
			setupStep = 'Configuration terminée';
		}
		embed.addFields({
			name: 'Setup',
			value: setupStep,
			inline: true
		});

		// Field Tier
		const tier = isPremiumGuild ? 'Premium' : 'Free';
		embed.addFields({
			name: 'Tier',
			value: tier,
			inline: true
		});

		await interaction.reply({
			embeds: [embed],
			flags: MessageFlags.Ephemeral
		});
	}
};
