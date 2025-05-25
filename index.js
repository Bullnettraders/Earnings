// === util.js ===
// Utility-Funktionen für den Nasdaq Earnings Bot
// Kann in Tests importiert werden

import fetch from 'node-fetch';

/**
 * Holt das Nasdaq Earnings Calendar JSON für ein gegebenes Datum (YYYY-MM-DD)
 */
export async function fetchEarningsCalendar(date) {
  const url = `https://api.nasdaq.com/api/calendar/earnings?date=${date}`;
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'https://www.nasdaq.com',
      'Referer': 'https://www.nasdaq.com/market-activity/earnings',
      'User-Agent': 'Mozilla/5.0'
    }
  });
  if (!res.ok) throw new Error(`Nasdaq API Error: ${res.status}`);
  const json = await res.json();
  const rows = json.data?.earningsCalendar?.rows || json.data?.rows || [];
  return Array.isArray(rows) ? rows : [];
}

/**
 * Formatiert eine Übersichtsliste von Earnings-Einträgen
 */
export function formatOverview(rows) {
  if (!rows.length) return 'Keine Earnings heute.';
  const lines = rows.map(r => {
    const symbol = r.symbol || r.ticker || '';
    const company = r.company || '';
    const time = r.time || '';
    const estimate = r.epsEstimate || '-';
    return `\`${time}\` • **${symbol}** (${company})\n> Estimate EPS: ${estimate}`;
  });
  return lines.join('\n\n');
}

/**
 * Vergleicht tatsächliches EPS mit Schätzung und liefert ein Emoji-Label
 */
export function compareEps(actualStr, estimateStr) {
  const a = parseFloat(actualStr.replace(/[^0-9.-]/g, ''));
  const e = parseFloat(estimateStr.replace(/[^0-9.-]/g, ''));
  if (isNaN(a) || isNaN(e)) return '';
  if (a > e) return '🔺 über Erwartation';
  if (a < e) return '🔻 unter Expectation';
  return '→ exakt Erwartung';
}


// === index.js ===
// Hauptskript: Discord-Bot mit Cron-Jobs und Slash-Command für Earnings-Reporting

import { Client, GatewayIntentBits, Routes } from 'discord.js';
import { REST } from '@discordjs/rest';
import cron from 'node-cron';
import dotenv from 'dotenv';
import { fetchEarningsCalendar, formatOverview, compareEps } from './util.js';

dotenv.config();
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const token = process.env.DISCORD_TOKEN;
const channelId = process.env.CHANNEL_ID;
const tz = process.env.TZ || 'Europe/Berlin';

// Slash-Command Definition
const commands = [
  {
    name: 'earnings',
    description: 'Zeige Nasdaq Earnings Übersicht für heute'
  }
];

// Slash-Commands registrieren
const rest = new REST({ version: '10' }).setToken(token);
(async () => {
  try {
    console.log('Registriere Slash-Commands...');
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );
    console.log('Slash-Commands registriert.');
  } catch (err) {
    console.error('Fehler beim Registrieren:', err);
  }
})();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const lastEps = {};

client.once('ready', () => {
  console.log('Bot ist online!');
});

// Slash-Command Handler
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

// Cron-Job: 00:00 Uhr – Tagesübersicht
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

// Cron-Job: 08–22 Uhr, Polling jede Minute für neue EPS
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
