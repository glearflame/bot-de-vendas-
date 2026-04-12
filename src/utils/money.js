export function formatBRL(cents) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(cents / 100);
}

export function parseBRL(value) {
  const normalized = String(value)
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.]/g, '');

  const number = Number.parseFloat(normalized);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error('Valor invalido.');
  }

  return Math.round(number * 100);
}
