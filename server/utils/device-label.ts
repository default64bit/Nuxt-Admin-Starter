// A short device label from the user agent ("Chrome on Linux"). Only the label is stored; the raw user agent never is.

const BROWSERS: readonly [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\bOPR\/|\bOpera\b/, "Opera"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bChrome\/|\bCriOS\//, "Chrome"],
  [/\bSafari\//, "Safari"],
];

const SYSTEMS: readonly [RegExp, string][] = [
  [/Windows/, "Windows"],
  [/Android/, "Android"],
  [/iPhone|iPad|iPod/, "iOS"],
  [/Macintosh|Mac OS X/, "macOS"],
  [/CrOS/, "ChromeOS"],
  [/Linux|X11/, "Linux"],
];

export function deviceLabelFromUserAgent(userAgent: string | undefined | null): string {
  const ua = userAgent ?? "";
  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1] ?? "Browser";
  const system = SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1];
  return system ? `${browser} on ${system}` : browser;
}
