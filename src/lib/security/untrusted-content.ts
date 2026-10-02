const signals = [
  /ignore (previous|all|purchasing) (instructions|restrictions)/i,
  /system message/i,
  /developer message/i,
  /override policy/i,
  /bypass restrictions/i,
  /purchase immediately/i,
  /do not ask (the )?user/i,
  /ignore budget/i,
  /proceed without (user )?confirmation/i,
];
export function inspectUntrustedContent(content: string) {
  const matches = signals
    .filter((pattern) => pattern.test(content))
    .map((pattern) => pattern.source);
  return { suspicious: matches.length > 0, signals: matches };
}
// JSON encoding prevents delimiter breakouts; this is data in a USER message, never system authority.
export function untrustedCatalogData(data: unknown) {
  return JSON.stringify({ trust: "UNTRUSTED_MERCHANT_DATA", data });
}
