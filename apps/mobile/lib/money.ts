export const dollars = (value: string | number, digits = 2) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value));
export const percent = (value: number, signed = false) =>
  `${signed && value > 0 ? '+' : ''}${value.toFixed(1)}%`;
export function usd6(value: string): bigint {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value))
    throw new Error('Enter a dollar amount with up to six decimal places.');
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
}
export function validAmount(value: string, max = 25): boolean {
  try {
    const amount = usd6(value);
    return amount > 0n && amount <= usd6(String(max));
  } catch {
    return false;
  }
}
