import { summarizeEmailMarketing, type AnalyticsOrder } from './analytics.js';

export function matchedMarketingMonths(orders: AnalyticsOrder[], previousOrders: AnalyticsOrder[], year: number, statuses: string[], now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const clock = `${parts.hour}:${parts.minute}:${parts.second}`;
  const pad = (n: number) => String(n).padStart(2, '0');
  return Array.from({ length: 12 }, (_, index) => {
    const previousMonth = index === 0 ? 12 : index;
    const previousYear = index === 0 ? year - 1 : year;
    // Clamp both sides to the same day when one month is shorter.
    const day = Math.min(Number(parts.day), new Date(Date.UTC(year, index + 1, 0)).getUTCDate(), new Date(Date.UTC(previousYear, previousMonth, 0)).getUTCDate());
    const currentFrom = `${year}-${pad(index + 1)}-01T00:00:00`;
    const previousFrom = `${previousYear}-${pad(previousMonth)}-01T00:00:00`;
    const currentTo = `${year}-${pad(index + 1)}-${pad(day)}T${clock}`;
    const previousTo = `${previousYear}-${pad(previousMonth)}-${pad(day)}T${clock}`;
    const select = (source: AnalyticsOrder[], from: string, to: string) => source.filter((order) => Boolean(order.date_created && order.date_created >= from && order.date_created <= to));
    const current = summarizeEmailMarketing(select(orders, currentFrom, currentTo), [], year, statuses).months[index]!;
    const previous = summarizeEmailMarketing(select(index === 0 ? previousOrders : orders, previousFrom, previousTo), [], previousYear, statuses).months[previousMonth - 1]!;
    return { current, previous, currentFrom, currentTo, previousFrom, previousTo, timeZone: 'America/Argentina/Buenos_Aires' };
  });
}
