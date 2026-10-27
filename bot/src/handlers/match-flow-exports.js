import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export function appealButton(matchId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`request_appeal:${matchId}`)
      .setLabel('Request review')
      .setStyle(ButtonStyle.Primary)
  );
}
