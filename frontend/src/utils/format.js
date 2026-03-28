export function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatMonth(dateStr) {
  if (!dateStr) return '';
  const [year, month] = dateStr.split('-');
  const date = new Date(year, parseInt(month) - 1);
  return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
}

export function getMonthName(month, year) {
  const date = new Date(year, month - 1);
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

export function getPercentage(value, total) {
  if (!total) return 0;
  return ((value / total) * 100).toFixed(1);
}
