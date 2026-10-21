export function signedAmount(value, type, previousAmount = null) {
  const number = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(number) || number === 0) throw new Error('Informe um valor diferente de zero.');
  if (type === 'expense') return -Math.abs(number);
  if (type === 'income') return Math.abs(number);
  return Math.abs(number) * (Number(previousAmount ?? number) < 0 ? -1 : 1);
}

export function localToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function confidenceMatches(value, filter) {
  if (filter === 'all') return true;
  if (value == null) return filter === 'unknown';
  if (filter === 'high') return value >= 0.8;
  if (filter === 'medium') return value >= 0.5 && value < 0.8;
  return value < 0.5;
}
