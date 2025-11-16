"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDeviceInfo = buildDeviceInfo;
const UAParser = require("ua-parser-js");
function buildDeviceInfo(userAgent) {
    if (!userAgent)
        return undefined;
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
//# sourceMappingURL=device.util.js.map