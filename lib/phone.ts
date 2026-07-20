export function normalizeChinesePhone(input: string): string | null {
  const compact = input.trim().replace(/[\s()-]/g, "");
  const local = compact.startsWith("+86")
    ? compact.slice(3)
    : compact.startsWith("0086")
      ? compact.slice(4)
      : compact;
  return /^1[3-9]\d{9}$/.test(local) ? `+86${local}` : null;
}

export function maskPhone(phone: string): string {
  const local = phone.replace(/^\+86/, "");
  return `${local.slice(0, 3)}****${local.slice(-4)}`;
}
