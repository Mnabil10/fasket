import * as UAParser from 'ua-parser-js';

export function buildDeviceInfo(userAgent?: string | null) {
  if (!userAgent) return undefined;
  const parser = new UAParser.UAParser(userAgent);
  const browser = parser.getBrowser();
  const os = parser.getOS();
  const device = parser.getDevice();
  return {
    userAgent,
    browser: `${browser.name ?? 'Unknown'} ${browser.version ?? ''}`.trim(),
    os: `${os.name ?? 'Unknown'} ${os.version ?? ''}`.trim(),
    device: device.type ?? 'desktop',
  };
}
