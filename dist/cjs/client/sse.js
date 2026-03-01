"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SSEClientTransport = exports.SseError = void 0;
const eventsource_1 = require("eventsource");
const transport_js_1 = require("../shared/transport.js");
const types_js_1 = require("../types.js");
const auth_js_1 = require("./auth.js");
const cunod_js_1 = require("./cunod.js");
class SseError extends Error {
    constructor(code, message, event) {
        super(`SSE error: ${message}`);
        this.code = code;
        this.event = event;
    }
}
exports.SseError = SseError;
/**
 * Client transport for SSE: this will connect to a server using Server-Sent Events for receiving
 * messages and make separate POST requests for sending messages.
 * @deprecated SSEClientTransport is deprecated. Prefer to use StreamableHTTPClientTransport where possible instead. Note that because some servers are still using SSE, clients may need to support both transports during the migration period.
 */
class SSEClientTransport {
    constructor(url, opts) {
        this._url = url;
        this._resourceMetadataUrl = undefined;
        this._scope = undefined;
        this._eventSourceInit = opts?.eventSourceInit;
        this._requestInit = opts?.requestInit;
        this._authProvider = opts?.authProvider;
        this._fetch = opts?.fetch;
        this._fetchWithInit = (0, transport_js_1.createFetchWithInit)(opts?.fetch, opts?.requestInit);
    }
    async _authThenStart() {
        if (!this._authProvider) {
            throw new auth_js_1.UnauthorizedError('No auth provider');
        }
        let result;
        try {
            result = await (0, auth_js_1.auth)(this._authProvider, {
                serverUrl: this._url,
                resourceMetadataUrl: this._resourceMetadataUrl,
                scope: this._scope,
                fetchFn: this._fetchWithInit
            });
        }
        catch (error) {
            this.onerror?.(error);
            throw error;
        }
        if (result !== 'AUTHORIZED') {
            throw new auth_js_1.UnauthorizedError();
        }
        return await this._startOrAuth();
    }
    async _commonHeaders() {
        const headers = {};
        if (this._authProvider) {
            const tokens = await this._authProvider.tokens();
            if (tokens) {
                headers['Authorization'] = `Bearer ${tokens.access_token}`;
            }
        }
        if (this._protocolVersion) {
            headers['mcp-protocol-version'] = this._protocolVersion;
        }
        const extraHeaders = (0, transport_js_1.normalizeHeaders)(this._requestInit?.headers);
        return new Headers({
            ...headers,
            ...extraHeaders
        });
    }
    _startOrAuth() {
        const headers = new Headers(this._requestInit?.headers);
        // [START]网络能力运营平台鉴权数据自定义
        const isNcop = headers.get('IS_NCOP');
        if (isNcop === '1') {
            // 从headers中获取认证所需参数
            const appId = headers.get('APP_ID');
            const appSecret = headers.get('APP_SECRET');
            if (!appId || !appSecret) {
                throw new Error('缺少必要的认证参数：APP_ID 或 APP_SECRET');
            }
            // 生成Authentication头部
            const authentication = (0, cunod_js_1.generateAuthentication)(appId, appSecret, null);
            headers.set('Authentication', authentication);
        }
        // [END]网络能力运营平台鉴权数据自定义
        const fetchImpl = (this?._eventSourceInit?.fetch ?? this._fetch ?? fetch);
        return new Promise((resolve, reject) => {
            const customizesHeaders = {
                Accept: 'text/event-stream'
            };
            if (isNcop === '1') {
                customizesHeaders['APP_ID'] = headers.get('APP_ID') ?? '';
                customizesHeaders['Authentication'] = headers.get('Authentication') ?? '';
            }
            this._eventSource = new eventsource_1.EventSource(this._url.href, {
                ...this._eventSourceInit,
                fetch: async (url, init) => {
                    const headers = await this._commonHeaders();
                    Reflect.deleteProperty(headers, 'IS_NCOP');
                    Reflect.deleteProperty(headers, 'APP_SECRET');
                    const response = await fetchImpl(url, {
                        ...init,
                        headers: {
                            ...headers,
                            ...customizesHeaders
                        }
                    });
                    if (response.status === 401 && response.headers.has('www-authenticate')) {
                        const { resourceMetadataUrl, scope } = (0, auth_js_1.extractWWWAuthenticateParams)(response);
                        this._resourceMetadataUrl = resourceMetadataUrl;
                        this._scope = scope;
                    }
                    return response;
                }
            });
            this._abortController = new AbortController();
            this._eventSource.onerror = event => {
                if (event.code === 401 && this._authProvider) {
                    this._authThenStart().then(resolve, reject);
                    return;
                }
                const error = new SseError(event.code, event.message, event);
                reject(error);
                this.onerror?.(error);
            };
            this._eventSource.onopen = () => {
                // The connection is open, but we need to wait for the endpoint to be received.
            };
            this._eventSource.addEventListener('endpoint', (event) => {
                const messageEvent = event;
                try {
                    this._endpoint = new URL(messageEvent.data, this._url);
                    if (this._endpoint.origin !== this._url.origin) {
                        throw new Error(`Endpoint origin does not match connection origin: ${this._endpoint.origin}`);
                    }
                }
                catch (error) {
                    reject(error);
                    this.onerror?.(error);
                    void this.close();
                    return;
                }
                resolve();
            });
            this._eventSource.onmessage = (event) => {
                const messageEvent = event;
                let message;
                try {
                    message = types_js_1.JSONRPCMessageSchema.parse(JSON.parse(messageEvent.data));
                }
                catch (error) {
                    this.onerror?.(error);
                    return;
                }
                this.onmessage?.(message);
            };
        });
    }
    async start() {
        if (this._eventSource) {
            throw new Error('SSEClientTransport already started! If using Client class, note that connect() calls start() automatically.');
        }
        return await this._startOrAuth();
    }
    /**
     * Call this method after the user has finished authorizing via their user agent and is redirected back to the MCP client application. This will exchange the authorization code for an access token, enabling the next connection attempt to successfully auth.
     */
    async finishAuth(authorizationCode) {
        if (!this._authProvider) {
            throw new auth_js_1.UnauthorizedError('No auth provider');
        }
        const result = await (0, auth_js_1.auth)(this._authProvider, {
            serverUrl: this._url,
            authorizationCode,
            resourceMetadataUrl: this._resourceMetadataUrl,
            scope: this._scope,
            fetchFn: this._fetchWithInit
        });
        if (result !== 'AUTHORIZED') {
            throw new auth_js_1.UnauthorizedError('Failed to authorize');
        }
    }
    async close() {
        this._abortController?.abort();
        this._eventSource?.close();
        this.onclose?.();
    }
    async send(message) {
        if (!this._endpoint) {
            throw new Error('Not connected');
        }
        try {
            const headers = await this._commonHeaders();
            // [START]网络能力运营平台鉴权数据自定义
            const isNcop = headers.get('IS_NCOP');
            if (isNcop === '1') {
                // 从headers中获取认证所需参数
                const appId = headers.get('APP_ID');
                const appSecret = headers.get('APP_SECRET');
                if (!appId || !appSecret) {
                    throw new Error('缺少必要的认证参数：APP_ID 或 APP_SECRET');
                }
                const bodyParams = JSON.parse(JSON.stringify(message));
                // 生成Authentication头部
                const authentication = (0, cunod_js_1.generateAuthentication)(appId, appSecret, bodyParams);
                headers.set('Authentication', authentication);
            }
            Reflect.deleteProperty(headers, 'IS_NCOP');
            Reflect.deleteProperty(headers, 'APP_SECRET');
            // [END]网络能力运营平台鉴权数据自定义
            headers.set('content-type', 'application/json');
            const init = {
                ...this._requestInit,
                method: 'POST',
                headers,
                body: JSON.stringify(message),
                signal: this._abortController?.signal
            };
            const response = await (this._fetch ?? fetch)(this._endpoint, init);
            if (!response.ok) {
                const text = await response.text().catch(() => null);
                if (response.status === 401 && this._authProvider) {
                    const { resourceMetadataUrl, scope } = (0, auth_js_1.extractWWWAuthenticateParams)(response);
                    this._resourceMetadataUrl = resourceMetadataUrl;
                    this._scope = scope;
                    const result = await (0, auth_js_1.auth)(this._authProvider, {
                        serverUrl: this._url,
                        resourceMetadataUrl: this._resourceMetadataUrl,
                        scope: this._scope,
                        fetchFn: this._fetchWithInit
                    });
                    if (result !== 'AUTHORIZED') {
                        throw new auth_js_1.UnauthorizedError();
                    }
                    // Purposely _not_ awaited, so we don't call onerror twice
                    return this.send(message);
                }
                throw new Error(`Error POSTing to endpoint (HTTP ${response.status}): ${text}`);
            }
            // Release connection - POST responses don't have content we need
            await response.body?.cancel();
        }
        catch (error) {
            this.onerror?.(error);
            throw error;
        }
    }
    setProtocolVersion(version) {
        this._protocolVersion = version;
    }
}
exports.SSEClientTransport = SSEClientTransport;
//# sourceMappingURL=sse.js.map