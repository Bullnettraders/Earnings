import { Client, GatewayIntentBits } from 'discord.js';
import cron from 'node-cron';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});
const channelId = process.env.CHANNEL_ID;
const tz = process.env.TZ || 'Europe/Berlin';

// Cache für bereits gepostete EPS
const lastEps = {};

// Nasdaq Earnings-Calendar API
async function fetchEarningsCalendar(date) {
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
  return json.data.earningsCalendar.rows || [];
}

function formatOverview(rows) {
  if (!rows.length) return 'Keine Earnings heute.';
  return rows.map(r =>
    `\`${r.time}\` • **${r.symbol}** (${r.company})\n` +
    `> Estimate EPS: ${r.epsEstimate || '-'}'
  ).join('\n\n');
}

function compareEps(actualStr, estimateStr) {
  const a = parseFloat(actualStr.replace(/[^0-9.-]/g, ''));
  const e = parseFloat(estimateStr.replace(/[^0-9.-]/g, ''));
  if (isNaN(a) || isNaN(e)) return '';
  if (a > e) return '🔺 über Expectation';
  if (a < e) return '🔻 unter Expectation';
  return '→ exakt Erwartung';
}

client.once('ready', () => {
  console.log('Bot ist online!');
  const channel = client.channels.cache.get(channelId);
  if (!channel?.isTextBased()) {
    console.error('Channel nicht gefunden!');
    process.exit(1);
  }

  // 00:00 Uhr: Übersicht
  cron.schedule('0 0 * * *', async () => {
    const date = new Date().toISOString().slice(0,10);
    const rows = await fetchEarningsCalendar(date);
    await channel.send(
      `📈 **Nasdaq Earnings Calendar ${date}**\n\n` +
      formatOverview(rows)
    );
  }, { timezone: tz });

  // 08–22 Uhr Polling jede Minute
  cron.schedule('*/1 8-22 * * *', async () => {
    const date = new Date().toISOString().slice(0,10);
    const rows = await fetchEarningsCalendar(date);
    const updates = [];
    for (const r of rows) {
      if (!r.epsActual) continue;
      const key = r.symbol;
      if (lastEps[key] !== r.epsActual) {
        const cmp = compareEps(r.epsActual, r.epsEstimate);
        updates.push(
          `\`${r.time}\` • **${r.symbol}** (${r.company}): ${r.epsActual} EPS ${cmp}`
        );
        lastEps[key] = r.epsActual;
      }
    }
    if (updates.length) {
      const now = new Date().toISOString().substr(11,5);
      await channel.send(
        `🕑 **Neue Earnings-Meldungen (${now})**\n\n` +
        updates.join('\n\n')
      );
    }
  }, { timezone: tz });

  // Test-Command
  client.on('messageCreate', async msg => {
    if (msg.channelId === channelId && msg.content === '!earnings') {
      const date = new Date().toISOString().slice(0,10);
      const rows = await fetchEarningsCalendar(date);
      await msg.reply(
        `📈 **Test: Nasdaq Earnings Calendar**\n\n` +
        formatOverview(rows)
      );
    }
  });
});

client.login(process.env.DISCORD_TOKEN);
