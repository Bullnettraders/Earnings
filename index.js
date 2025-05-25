// index.js
import { Client, GatewayIntentBits, Routes } from 'discord.js';
import { REST } from '@discordjs/rest';
import cron from 'node-cron';
import dotenv from 'dotenv';
import { fetchEarningsCalendar, formatOverview, compareEps } from './util.js';

dotenv.config();
const clientId  = process.env.CLIENT_ID;
const guildId   = process.env.GUILD_ID;
const token     = process.env.DISCORD_TOKEN;
const channelId = process.env.CHANNEL_ID;
const tz        = process.env.TZ || 'Europe/Berlin';

// 1. Slash-Command definieren
const commands = [
  { name: 'earnings', description: 'Zeige Nasdaq Earnings Übersicht für heute' }
];

// 2. Slash-Command registrieren
const rest = new REST({ version: '10' }).setToken(token);
(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );
    console.log('Slash-Commands registriert.');
  } catch (err) {
    console.error('Fehler beim Registrieren:', err);
  }
})();

// 3. Bot-Client initialisieren
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const lastEps = {};

client.once('ready', () => {
  console.log('Bot ist online!');
});

// 4. Slash-Command Handler
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'earnings') {
    await interaction.deferReply();
    try {
      const date = new Date().toISOString().slice(0,10);
      const rows = await fetchEarningsCalendar(date);
      await interaction.editReply(`📈 **Nasdaq Earnings Calendar ${date}**\n\n${formatOverview(rows)}`);
    } catch (err) {
      console.error('Slash-Command-Fehler:', err);
      await interaction.editReply('Fehler beim Abrufen der Earnings.');
    }
  }
});

// 5. Cron-Job: 00:00 Uhr – Tagesübersicht
cron.schedule('0 0 * * *', async () => {
  try {
    const date = new Date().toISOString().slice(0,10);
    const rows = await fetchEarningsCalendar(date);
    const channel = await client.channels.fetch(channelId);
    await channel.send(`📈 **Nasdaq Earnings Calendar ${date}**\n\n${formatOverview(rows)}`);
  } catch (err) {
    console.error('00:00-Job Fehler:', err);
  }
}, { timezone: tz });

// 6. Cron-Job: 08–22 Uhr, Polling jede Minute für neue EPS
cron.schedule('*/1 8-22 * * *', async () => {
  try {
    const date = new Date().toISOString().slice(0,10);
    const rows = await fetchEarningsCalendar(date);
    const updates = [];
    for (const r of rows) {
      if (!r.epsActual) continue;
      const key = r.symbol || r.ticker;
      if (lastEps[key] !== r.epsActual) {
        const cmp = compareEps(r.epsActual, r.epsEstimate);
        updates.push(`\`${r.time}\` • **${key}** (${r.company}): ${r.epsActual} EPS ${cmp}`);
        lastEps[key] = r.epsActual;
      }
    }
    if (updates.length) {
      const now = new Date().toISOString().substr(11,5);
      const channel = await client.channels.fetch(channelId);
      await channel.send(`🕑 **Neue Earnings-Meldungen (${now})**\n\n${updates.join('\n\n')}`);
    }
  } catch (err) {
    console.error('Polling-Job Fehler:', err);
  }
}, { timezone: tz });

client.login(token);
