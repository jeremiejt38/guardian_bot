const { MessageFlags } = require('discord.js');

function replyEphemeral(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

module.exports = { replyEphemeral };
