// util.js
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
    return `\`${time}\` • **${symbol}** (${company})
> Estimate EPS: ${estimate}`;
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
  if (a > e) return '🔺 über Expectation';
  if (a < e) return '🔻 unter Expectation';
  return '→ exakt Erwartung';
}
