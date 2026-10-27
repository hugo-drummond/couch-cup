import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { getParticipantByDiscordId, linkParticipantByPsn } from '../lib/supabase.js';

export async function sendPsnLinkDm(user) {
  const dm = await user.createDM().catch(() => null);
  if (!dm) return;
  await dm.send({
    content: `Hey! We've got you on Discord but no PSN ID — which means no matches, no bracket, no glory. Fix that real quick by dropping your PSN ID below.`,
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`psn_link_btn:${user.id}`)
          .setLabel('Enter PSN ID')
          .setStyle(ButtonStyle.Primary)
      ),
    ],
  });
}

export async function handlePsnLinkButton(interaction) {
  const modal = new ModalBuilder()
    .setCustomId(`psn_link_modal:${interaction.user.id}`)
    .setTitle('Link your PSN ID');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('psn_input')
        .setLabel('Your PSN ID')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50)
    )
  );

  await interaction.showModal(modal);
}

export async function handlePsnLinkModal(interaction) {
  const psnId = interaction.fields.getTextInputValue('psn_input').trim();
  const participant = await linkParticipantByPsn(psnId, interaction.user.id);

  if (!participant) {
    await interaction.reply({
      content: `We couldn't find a signup with PSN ID **${psnId}**. Double-check and try again, or contact an admin.`,
      flags: 64,
    });
    return;
  }

  await interaction.reply({
    content: `✅ Linked! PSN **${psnId}** is now connected to your Discord. You're in the system — good luck! 🎮`,
    flags: 64,
  });
}
