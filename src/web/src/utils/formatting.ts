export function formatLastActivity(timestamp: number | null | undefined): string {
  if (!timestamp) return "—";

  const secondsElapsed = Math.floor(Date.now() / 1000 - timestamp);
  if (secondsElapsed < 2) return "just now";

  const hours = Math.floor(secondsElapsed / 3600);
  const minutes = Math.floor((secondsElapsed % 3600) / 60);
  const seconds = secondsElapsed % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if ((hours === 0 && seconds > 0) || parts.length === 0)
    parts.push(`${seconds}s`);

  return parts.join(" ") + " ago";
}

export function formatPing(ping: number | null | undefined): string {
  if (ping == null || isNaN(ping)) return "—";
  return `${Math.round(ping)} ms`;
}
