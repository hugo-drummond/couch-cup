const MONTHS = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
const TZ_OFFSETS = { SAST:2, CAT:2, EAT:3, WAT:1, UTC:0, GMT:0, BST:1, CET:1, CEST:2, EST:-5, EDT:-4, CST:-6, CDT:-5, MST:-7, PST:-8, PDT:-7, AEST:10 };

// Parse "Wed 21 May 8pm SAST" or "21 May 20:00 SAST" -> Date (UTC)
export function parseProposedTime(text) {
  const m = text.match(
    /(?:\w+\s+)?(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*(?:\s+(\d{4}))?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*([A-Za-z]+)?/i
  );
  if (!m) return null;

  const day   = parseInt(m[1]);
  const month = MONTHS[m[2].toLowerCase().slice(0, 3)];
  const year  = m[3] ? parseInt(m[3]) : new Date().getFullYear();
  let   hour  = parseInt(m[4]);
  const min   = parseInt(m[5] ?? '0');
  const ampm  = m[6]?.toLowerCase();
  const tz    = (m[7] ?? 'SAST').toUpperCase();

  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;

  const offsetHours = TZ_OFFSETS[tz] ?? 2;
  const utc = new Date(Date.UTC(year, month, day, hour - offsetHours, min));
  return isNaN(utc.getTime()) ? null : utc;
}

export function dts(date, style = 'F') {
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}
