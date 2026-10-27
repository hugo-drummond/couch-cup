/**
 * Run once (or after adding/changing commands) to register slash commands:
 *   node src/deploy-commands.js
 */
import 'dotenv/config';
import { REST, Routes } from 'discord.js';

import * as sync       from './commands/sync.js';
import * as bracketGen from './commands/bracket/generate.js';
import * as roundOpen  from './commands/round/open.js';
import * as roundClose from './commands/round/close.js';
import * as score      from './commands/score.js';
import * as adminCmd   from './commands/admin/force-result.js';

const body = [sync, bracketGen, roundOpen, roundClose, score, adminCmd].map(c => c.data.toJSON());

const guildId = process.env.NODE_ENV === 'development'
  ? process.env.DEV_GUILD_ID
  : process.env.DISCORD_GUILD_ID;

const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  console.log(`Registering ${body.length} commands → guild ${guildId} [${process.env.NODE_ENV ?? 'production'}]`);
  await rest.put(
    Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, guildId),
    { body }
  );
  console.log('Done.');
})();
