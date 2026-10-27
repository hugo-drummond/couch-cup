import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, Events } from 'discord.js';
import { handleScoreModal } from './commands/score.js';
import { handleButton, handleModal } from './handlers/match-flow.js';
import { sendPsnLinkDm, handlePsnLinkButton, handlePsnLinkModal } from './handlers/psn-link.js';
import { getParticipantByDiscordId } from './lib/supabase.js';
import { startSchedulerLoop } from './lib/scheduler.js';
import { config } from './config.js';

import * as sync       from './commands/sync.js';
import * as bracketGen from './commands/bracket/generate.js';
import * as roundOpen  from './commands/round/open.js';
import * as roundClose from './commands/round/close.js';
import * as score      from './commands/score.js';
import * as adminCmd   from './commands/admin/force-result.js';

const commands = new Collection();
for (const cmd of [sync, bracketGen, roundOpen, roundClose, score, adminCmd]) {
  commands.set(cmd.data.name, cmd);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (c) => {
  const mode = process.env.TEST_MODE === 'true' ? 'development' : 'production';
  console.log(`✅ Couch Cup Bot online as ${c.user.tag} [${mode} mode]`);
  startSchedulerLoop(c);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = commands.get(interaction.commandName);
      if (cmd) await cmd.execute(interaction);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('score_modal:')) {
      await handleScoreModal(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('psn_link_btn:')) {
      await handlePsnLinkButton(interaction);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('psn_link_modal:')) {
      await handlePsnLinkModal(interaction);
      return;
    }

    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      await handleModal(interaction);
    }
  } catch (err) {
    console.error('Interaction error:', err);
    // Discord error 10062 = unknown interaction (timed out before we could respond)
    if (err.code === 10062) return;
    const msg = { content: 'Something went wrong — please try again.', flags: 64 };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg).catch(() => {});
    } else {
      await interaction.reply(msg).catch(() => {});
    }
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const participant = await getParticipantByDiscordId(member.id);
    if (!participant) await sendPsnLinkDm(member.user);
  } catch (err) {
    console.error('[guildMemberAdd]', err.message);
  }
});

// Detect screenshot uploads in disputed match threads
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!message.channel.isThread()) return;
  if (!message.attachments.size) return;

  const image = message.attachments.find(a => a.contentType?.startsWith('image/'));
  if (!image) return;

  try {
    const { getMatchByThreadId, supabase } = await import('./lib/supabase.js');
    const match = await getMatchByThreadId(message.channelId);
    if (!match || match.dispute_status !== 'pending_screenshots') return;

    const pA = match.participant_a;
    const pB = match.participant_b;
    const isA = message.author.id === pA?.discord_id;
    const isB = message.author.id === pB?.discord_id;
    if (!isA && !isB) return;

    // Save screenshot URL to the reporter's score_report row
    const reporterId = isA ? pA.id : pB.id;
    await supabase.from('score_reports')
      .update({ screenshot_url: image.url })
      .eq('bracket_id', match.id)
      .eq('reporter_id', reporterId);

    await message.react('✅');
    console.log(`[screenshot] saved for match ${match.id} from ${message.author.username}`);

    // Check if both players have now uploaded — if so, DM the TD
    const { data: reports } = await supabase
      .from('score_reports')
      .select('screenshot_url, reporter_id')
      .eq('bracket_id', match.id);

    const bothUploaded = reports?.length >= 2 && reports.every(r => r.screenshot_url);
    if (bothUploaded && config.tournamentDirectorId) {
      const td = await client.users.fetch(config.tournamentDirectorId).catch(() => null);
      if (td) {
        await td.send([
          `🔴 **Score Dispute: Action Required**`,
          `Match: **${pA?.name} vs ${pB?.name}** (R${match.round_number})`,
          `Both players have uploaded their screenshots. Please review and use \`/admin override-match ${match.id} <winner_psn>\` to set the final result.`,
          `Thread: https://discord.com/channels/${config.guildId}/${match.discord_thread_id}`,
        ].join('\n'));
      }
    }
  } catch (err) {
    console.error('[screenshot listener]', err.message);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
