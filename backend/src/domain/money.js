// Money crosses the API as decimal BRL and is calculated as safe integer cents.
export function toCents(value) {
  const text = String(value ?? '').trim();
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) throw new RangeError('Valor monetário inválido; use até duas casas decimais.');
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace(/^-/, '').split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > 999999999999999n) throw new RangeError('Valor excede o limite monetário.');
  return Number(negative ? -cents : cents);
}
export function fromCents(cents) {
  if (!Number.isSafeInteger(cents)) throw new RangeError('Total monetário excede a precisão suportada.');
  return cents / 100;
}
export function sumMoney(values) {
  return fromCents(values.reduce((sum, value) => {
    const next = sum + toCents(value);
    if (!Number.isSafeInteger(next)) throw new RangeError('Total monetário excede a precisão suportada.');
    return next;
  }, 0));
}
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()); }
