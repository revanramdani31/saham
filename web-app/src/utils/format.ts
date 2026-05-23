export const formatCompact = (num: number) => {
  if (num === undefined || num === null) return '0';
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(num);
};

export const formatPrice = (num: number) => {
  if (num === undefined || num === null) return '0';
  return new Intl.NumberFormat('id-ID').format(num);
};
