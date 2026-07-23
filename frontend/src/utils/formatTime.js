const UNITS = [
  ['year', 31536000],
  ['month', 2592000],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
];

export function timeAgo(isoString) {
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (seconds < 45) return 'just now';

  for (const [unit, secondsInUnit] of UNITS) {
    const value = Math.floor(seconds / secondsInUnit);
    if (value >= 1) return `${value} ${unit}${value > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}
