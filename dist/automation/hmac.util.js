"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signAutomationPayload = signAutomationPayload;
exports.verifyAutomationSignature = verifyAutomationSignature;
const crypto_1 = require("crypto");
function signAutomationPayload(secret, timestamp, body) {
    return (0, crypto_1.createHmac)('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}
function verifyAutomationSignature(secret, headers, body, toleranceSeconds = 300) {
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - headers.timestamp) > toleranceSeconds) {
        return false;
    }
    const expected = signAutomationPayload(secret, headers.timestamp, body);
    try {
        return (0, crypto_1.timingSafeEqual)(Buffer.from(headers.signature), Buffer.from(expected));
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=hmac.util.js.map