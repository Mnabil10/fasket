export declare function cleanString(value: unknown, opts?: {
    lowerCase?: boolean;
    maxLength?: number;
}): unknown;
export declare function cleanNullableString(value: unknown, opts?: {
    lowerCase?: boolean;
    maxLength?: number;
}): string | undefined;
export declare function deepSanitize(input: any): any;
