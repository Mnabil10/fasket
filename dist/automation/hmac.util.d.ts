export interface HmacHeaders {
    signature: string;
    timestamp: number;
}
export declare function signAutomationPayload(secret: string, timestamp: number, body: string): string;
export declare function verifyAutomationSignature(secret: string, headers: HmacHeaders, body: string, toleranceSeconds?: number): boolean;
