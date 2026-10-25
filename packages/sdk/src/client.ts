import type {
  AddMembersRequest,
  AdminUserRow,
  AuditLogEntry,
  AuthSession,
  Chat,
  ChatMember,
  ConfigEntry,
  ConfirmUploadRequest,
  ConfirmUploadResponse,
  CreateChatRequest,
  CreateChannelRequest,
  CreateDmRequest,
  CreateGroupRequest,
  CreateInviteRequest,
  CreateUploadRequest,
  DeviceKeyBundle,
  DownloadInfo,
  EditMessageRequest,
  FeatureFlag,
  ForwardMessageRequest,
  HealthCheck,
  HeartbeatResponse,
  Invite,
  KeyBundle,
  LoginRequest,
  MarkReadRequest,
  Message,
  MessagePage,
  MessageSearchQuery,
  MessageSearchResult,
  PresignedUpload,
  PublicUser,
  PublishKeysRequest,
  ReactRequest,
  ReadReceiptRequest,
  RefreshRequest,
  RegisterRequest,
  SearchQuery,
  SearchResult,
  SendMessageRequest,
  SetupRequest,
  SetupStatus,
  TokenPair,
  UpdateChatRequest,
  UpdateConfigRequest,
  UpdateFeatureFlagRequest,
  UpdateMemberRoleRequest,
  UpdateProfileRequest,
  UpdateTlsConfigRequest,
  UpdateUserAdminRequest,
  UpsertRetentionPolicyRequest,
  UserPresence,
  UserProfile,
  RetentionPolicy,
  TlsConfig,
} from "@neochat/shared";
import type { ErrorResponse } from "@neochat/shared";
import { ApiError, NetworkError } from "./errors.js";
import type { ApiClientOptions, RequestOptions } from "./types.js";

const API_PREFIX = "/api/v1";

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultHeaders: Record<string, string>;
  private accessToken?: string;

  constructor(baseUrl: string, options: ApiClientOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.defaultHeaders = { Accept: "application/json", ...options.headers };
    this.accessToken = options.accessToken;
  }

  setAccessToken(token: string | undefined): void {
    this.accessToken = token;
  }

  readonly auth = {
    login: (body: LoginRequest, opts?: RequestOptions) =>
      this.post<AuthSession>(`${API_PREFIX}/auth/login`, body, opts),
    register: (body: RegisterRequest, opts?: RequestOptions) =>
      this.post<AuthSession>(`${API_PREFIX}/auth/register`, body, opts),
    refresh: (body: RefreshRequest, opts?: RequestOptions) =>
      this.post<TokenPair>(`${API_PREFIX}/auth/refresh`, body, opts),
    logout: (opts?: RequestOptions) =>
      this.post<void>(`${API_PREFIX}/auth/logout`, undefined, opts),
    me: (opts?: RequestOptions) => this.get<UserProfile>(`${API_PREFIX}/auth/me`, opts),
  };

  readonly setup = {
    status: (opts?: RequestOptions) => this.get<SetupStatus>(`${API_PREFIX}/setup/status`, opts),
    complete: (body: SetupRequest, opts?: RequestOptions) =>
      this.post<AuthSession>(`${API_PREFIX}/setup`, body, opts),
  };

  readonly health = {
    get: (opts?: RequestOptions) => this.get<HealthCheck>(`${API_PREFIX}/health`, opts),
  };

  readonly users = {
    updateProfile: (body: UpdateProfileRequest, opts?: RequestOptions) =>
      this.patch<UserProfile>(`${API_PREFIX}/users/me`, body, opts),
    search: (q: string, opts?: RequestOptions) =>
      this.get<PublicUser[]>(`${API_PREFIX}/users/search?q=${encodeURIComponent(q)}`, opts),
  };

  readonly chats = {
    list: (opts?: RequestOptions) => this.get<Chat[]>(`${API_PREFIX}/chats`, opts),
    create: (body: CreateChatRequest, opts?: RequestOptions) =>
      this.post<Chat>(`${API_PREFIX}/chats`, body, opts),
    createDm: (body: CreateDmRequest, opts?: RequestOptions) =>
      this.post<Chat>(`${API_PREFIX}/chats`, { type: "dm", memberIds: [body.peerUserId] }, opts),
    createGroup: (body: CreateGroupRequest, opts?: RequestOptions) =>
      this.post<Chat>(
        `${API_PREFIX}/chats`,
        {
          type: "group",
          title: body.title,
          description: body.description,
          memberIds: body.memberIds,
        },
        opts,
      ),
    createChannel: (body: CreateChannelRequest, opts?: RequestOptions) =>
      this.post<Chat>(
        `${API_PREFIX}/chats`,
        {
          type: "channel",
          title: body.title,
          description: body.description,
          memberIds: body.memberIds ?? [],
        },
        opts,
      ),
    get: (chatId: string, opts?: RequestOptions) =>
      this.get<Chat>(`${API_PREFIX}/chats/${chatId}`, opts),
    update: (chatId: string, body: UpdateChatRequest, opts?: RequestOptions) =>
      this.patch<Chat>(`${API_PREFIX}/chats/${chatId}`, body, opts),
    listMembers: (chatId: string, opts?: RequestOptions) =>
      this.get<ChatMember[]>(`${API_PREFIX}/chats/${chatId}/members`, opts),
    addMembers: (chatId: string, body: AddMembersRequest, opts?: RequestOptions) =>
      this.post<ChatMember[]>(`${API_PREFIX}/chats/${chatId}/members`, body, opts),
    updateMemberRole: (
      chatId: string,
      userId: string,
      body: UpdateMemberRoleRequest,
      opts?: RequestOptions,
    ) => this.patch<ChatMember[]>(`${API_PREFIX}/chats/${chatId}/members/${userId}`, body, opts),
    join: (chatId: string, opts?: RequestOptions) =>
      this.post<Chat>(`${API_PREFIX}/chats/${chatId}/join`, undefined, opts),
    leave: (chatId: string, opts?: RequestOptions) =>
      this.post<{ ok: true }>(`${API_PREFIX}/chats/${chatId}/leave`, undefined, opts),
    markRead: (chatId: string, body: MarkReadRequest, opts?: RequestOptions) =>
      this.post<{ ok: true }>(`${API_PREFIX}/chats/${chatId}/read`, body, opts),
    pinMessage: (chatId: string, messageId: string, opts?: RequestOptions) =>
      this.post<{ ok: true; messageId: string }>(
        `${API_PREFIX}/chats/${chatId}/messages/${messageId}/pin`,
        undefined,
        opts,
      ),
    unpinMessage: (chatId: string, messageId: string, opts?: RequestOptions) =>
      this.delete<{ ok: true; messageId: string }>(
        `${API_PREFIX}/chats/${chatId}/messages/${messageId}/pin`,
        opts,
      ),
  };

  readonly messages = {
    list: (
      chatId: string,
      params: { cursor?: number; limit?: number } = {},
      opts?: RequestOptions,
    ) => {
      const search = new URLSearchParams();
      if (params.cursor !== undefined) search.set("cursor", String(params.cursor));
      if (params.limit !== undefined) search.set("limit", String(params.limit));
      const qs = search.toString();
      return this.get<MessagePage>(
        `${API_PREFIX}/chats/${chatId}/messages${qs ? `?${qs}` : ""}`,
        opts,
      );
    },
    send: (body: SendMessageRequest, opts?: RequestOptions) =>
      this.post<Message>(`${API_PREFIX}/messages`, body, opts),
    edit: (messageId: string, body: EditMessageRequest, opts?: RequestOptions) =>
      this.patch<Message>(`${API_PREFIX}/messages/${messageId}`, body, opts),
    remove: (messageId: string, opts?: RequestOptions) =>
      this.delete<Message>(`${API_PREFIX}/messages/${messageId}`, opts),
    forward: (messageId: string, body: ForwardMessageRequest, opts?: RequestOptions) =>
      this.post<Message>(`${API_PREFIX}/messages/${messageId}/forward`, body, opts),
    react: (messageId: string, body: ReactRequest, opts?: RequestOptions) =>
      this.post<Message>(`${API_PREFIX}/messages/${messageId}/reactions`, body, opts),
    unreact: (messageId: string, emoji: string, opts?: RequestOptions) =>
      this.delete<void>(
        `${API_PREFIX}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
        opts,
      ),
    receipt: (body: ReadReceiptRequest, opts?: RequestOptions) =>
      this.post<{ ok: true }>(`${API_PREFIX}/messages/receipts`, body, opts),
  };

  readonly keys = {
    publish: (body: PublishKeysRequest, opts?: RequestOptions) =>
      this.post<{ ok: true }>(`${API_PREFIX}/keys/publish`, body, opts),
    getBundle: (userId: string, deviceId: string, opts?: RequestOptions) =>
      this.get<KeyBundle>(`${API_PREFIX}/keys/users/${userId}/devices/${deviceId}`, opts),
    listBundles: (userId: string, opts?: RequestOptions) =>
      this.get<DeviceKeyBundle[]>(`${API_PREFIX}/keys/users/${userId}`, opts),
  };

  readonly media = {
    createUpload: (body: CreateUploadRequest, opts?: RequestOptions) =>
      this.post<PresignedUpload>(`${API_PREFIX}/media/uploads`, body, opts),
    confirmUpload: (mediaObjectId: string, body: ConfirmUploadRequest, opts?: RequestOptions) =>
      this.post<ConfirmUploadResponse>(`${API_PREFIX}/media/${mediaObjectId}/confirm`, body, opts),
    download: (mediaObjectId: string, opts?: RequestOptions) =>
      this.get<DownloadInfo>(`${API_PREFIX}/media/${mediaObjectId}/download`, opts),
  };

  readonly search = {
    global: (query: SearchQuery, opts?: RequestOptions) => {
      const search = new URLSearchParams({ q: query.q, limit: String(query.limit) });
      return this.get<SearchResult>(`${API_PREFIX}/search?${search}`, opts);
    },
    messages: (query: MessageSearchQuery, opts?: RequestOptions) => {
      const search = new URLSearchParams({ chatId: query.chatId, limit: String(query.limit) });
      if (query.contentType) search.set("contentType", query.contentType);
      if (query.from) search.set("from", query.from);
      if (query.to) search.set("to", query.to);
      if (query.cursor !== undefined) search.set("cursor", String(query.cursor));
      return this.get<MessageSearchResult>(`${API_PREFIX}/search/messages?${search}`, opts);
    },
  };

  readonly presence = {
    heartbeat: (opts?: RequestOptions) =>
      this.post<HeartbeatResponse>(`${API_PREFIX}/presence/heartbeat`, undefined, opts),
    offline: (opts?: RequestOptions) =>
      this.post<void>(`${API_PREFIX}/presence/offline`, undefined, opts),
    get: (userId: string, opts?: RequestOptions) =>
      this.get<UserPresence>(`${API_PREFIX}/presence/${userId}`, opts),
  };

  readonly admin = {
    listUsers: (opts?: RequestOptions) =>
      this.get<AdminUserRow[]>(`${API_PREFIX}/admin/users`, opts),
    updateUser: (userId: string, body: UpdateUserAdminRequest, opts?: RequestOptions) =>
      this.patch<AdminUserRow>(`${API_PREFIX}/admin/users/${userId}`, body, opts),
    listInvites: (opts?: RequestOptions) => this.get<Invite[]>(`${API_PREFIX}/admin/invites`, opts),
    createInvite: (body: CreateInviteRequest, opts?: RequestOptions) =>
      this.post<Invite>(`${API_PREFIX}/admin/invites`, body, opts),
    revokeInvite: (inviteId: string, opts?: RequestOptions) =>
      this.delete<void>(`${API_PREFIX}/admin/invites/${inviteId}`, opts),
    listAudit: (opts?: RequestOptions) =>
      this.get<AuditLogEntry[]>(`${API_PREFIX}/admin/audit`, opts),
    listFlags: (opts?: RequestOptions) =>
      this.get<FeatureFlag[]>(`${API_PREFIX}/admin/flags`, opts),
    updateFlag: (key: string, body: UpdateFeatureFlagRequest, opts?: RequestOptions) =>
      this.patch<FeatureFlag>(`${API_PREFIX}/admin/flags/${key}`, body, opts),
    listConfig: (opts?: RequestOptions) =>
      this.get<ConfigEntry[]>(`${API_PREFIX}/admin/config`, opts),
    updateConfig: (
      category: string,
      key: string,
      body: UpdateConfigRequest,
      opts?: RequestOptions,
    ) => this.patch<ConfigEntry>(`${API_PREFIX}/admin/config/${category}/${key}`, body, opts),
    getTls: (opts?: RequestOptions) => this.get<TlsConfig>(`${API_PREFIX}/admin/tls`, opts),
    updateTls: (body: UpdateTlsConfigRequest, opts?: RequestOptions) =>
      this.put<TlsConfig>(`${API_PREFIX}/admin/tls`, body, opts),
    listRetention: (opts?: RequestOptions) =>
      this.get<RetentionPolicy[]>(`${API_PREFIX}/admin/retention`, opts),
    upsertRetention: (body: UpsertRetentionPolicyRequest, opts?: RequestOptions) =>
      this.put<RetentionPolicy>(`${API_PREFIX}/admin/retention`, body, opts),
  };

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    opts: RequestOptions = {},
  ): Promise<T> {
    const headers: Record<string, string> = { ...this.defaultHeaders };
    const token = opts.accessToken ?? this.accessToken;
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: opts.signal,
      });
    } catch (error) {
      throw new NetworkError(error);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    const payload = text ? (JSON.parse(text) as unknown) : undefined;

    if (!response.ok) {
      throw new ApiError(payload as ErrorResponse);
    }

    return payload as T;
  }

  get<T>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>("GET", path, undefined, opts);
  }

  post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this.request<T>("POST", path, body, opts);
  }

  patch<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this.request<T>("PATCH", path, body, opts);
  }

  put<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this.request<T>("PUT", path, body, opts);
  }

  delete<T>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>("DELETE", path, undefined, opts);
  }
}
