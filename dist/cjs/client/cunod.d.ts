type JsonValue = string | number | boolean | null | JsonValue[] | {
    [key: string]: JsonValue;
};
export declare function generateAuthentication(appId: string, appSecret: string, bodyParams: JsonValue | null): string;
export {};
//# sourceMappingURL=cunod.d.ts.map