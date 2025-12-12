import { signAutomationPayload, verifyAutomationSignature } from './hmac.util';

describe('Automation HMAC util', () => {
  it('verifies signed payload within window', () => {
    const secret = 'test-secret';
    const body = JSON.stringify({ hello: 'world' });
    const ts = Math.floor(Date.now() / 1000);
    const sig = signAutomationPayload(secret, ts, body);
    expect(verifyAutomationSignature(secret, { signature: sig, timestamp: ts }, body, 300)).toBe(true);
  });

  it('rejects altered payload', () => {
    const secret = 'test-secret';
    const body = JSON.stringify({ hello: 'world' });
    const ts = Math.floor(Date.now() / 1000);
    const sig = signAutomationPayload(secret, ts, body);
    expect(verifyAutomationSignature(secret, { signature: sig, timestamp: ts }, body + 'x', 300)).toBe(false);
  });
});
