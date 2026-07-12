// Date helpers: office follows weekdays only, skipping major US holidays.

export function todayStr() { return new Date().toISOString().split('T')[0]; }

// Major US holidays — skip these just like weekends
export function getHolidays(year) {
  // Fixed-date holidays
  const fixed = [
    `${year}-01-01`, // New Year's Day
    `${year}-07-04`, // Independence Day
    `${year}-11-11`, // Veterans Day
    `${year}-12-24`, // Christmas Eve
    `${year}-12-25`, // Christmas Day
    `${year}-12-31`, // New Year's Eve
  ];
  // Calculated holidays
  const h = [];
  // MLK Day: 3rd Monday of January
  h.push(nthWeekdayOfMonth(year, 0, 1, 3));
  // Presidents Day: 3rd Monday of February
  h.push(nthWeekdayOfMonth(year, 1, 1, 3));
  // Memorial Day: last Monday of May
  h.push(lastWeekdayOfMonth(year, 4, 1));
  // Labor Day: 1st Monday of September
  h.push(nthWeekdayOfMonth(year, 8, 1, 1));
  // Columbus Day: 2nd Monday of October
  h.push(nthWeekdayOfMonth(year, 9, 1, 2));
  // Thanksgiving: 4th Thursday of November
  h.push(nthWeekdayOfMonth(year, 10, 4, 4));
  // Day after Thanksgiving
  const tg = new Date(nthWeekdayOfMonth(year, 10, 4, 4));
  tg.setDate(tg.getDate() + 1);
  h.push(tg.toISOString().split('T')[0]);
  return new Set([...fixed, ...h]);
}

export function nthWeekdayOfMonth(year, month, dow, n) {
  const d = new Date(year, month, 1);
  let count = 0;
  while (true) {
    if (d.getDay() === dow) { count++; if (count === n) break; }
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().split('T')[0];
}

export function lastWeekdayOfMonth(year, month, dow) {
  const d = new Date(year, month + 1, 0); // last day of month
  while (d.getDay() !== dow) d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

export function isHoliday(date) {
  const key = date.toISOString().split('T')[0];
  return getHolidays(date.getFullYear()).has(key);
}

// Advance date forward past weekends AND holidays
export function nextWorkday(date) {
  const d = new Date(date);
  let safety = 0;
  while (d.getDay() === 0 || d.getDay() === 6 || isHoliday(d)) {
    d.setDate(d.getDate() + 1);
    if (++safety > 14) break;
  }
  return d;
}

export function getStepDueDate(txDate, stepDays) {
  const raw = new Date(txDate);
  raw.setDate(raw.getDate() + stepDays);
  return nextWorkday(raw);
}
