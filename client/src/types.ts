export interface User {
  id: number;
  username: string;
  displayName: string;
  bio: string;
  avatar: string;
  isAdmin?: boolean;
  banned?: boolean;
  deleted?: boolean;
  hideLastSeen?: boolean;
  lastSeen: number;
  lastSeenHidden?: boolean;
  online: boolean;
  createdAt: number;
}

export interface Media {
  id: string;
  kind: "image" | "video" | "audio" | "voice" | "file";
  mime: string;
  name: string;
  size: number;
  width?: number;
  height?: number;
  hasThumb?: boolean;
}

export interface Message {
  id: number;
  chatId: number;
  senderId: number;
  sender: { id: number; username: string; displayName: string; avatar: string };
  kind: "text" | "image" | "video" | "audio" | "voice" | "file" | "system" | "call";
  text: string;
  media?: Media;
  replyTo?: number;
  reply?: { id: number; kind: string; text: string; senderName: string };
  editedAt?: number;
  createdAt: number;
  clientId?: string;
  // client-only state for optimistic sends
  pending?: boolean;
  failed?: boolean;
  progress?: number;
  localUrl?: string;
}

export type ChatType = "direct" | "group" | "channel";

export interface Chat {
  id: number;
  type: ChatType;
  title: string;
  handle: string;
  description: string;
  avatar: string;
  inviteCode?: string;
  ownerId: number;
  createdAt: number;
  lastMessageAt: number;
  role: "owner" | "admin" | "member";
  muted: boolean;
  archived: boolean;
  pinned: boolean;
  lastReadId: number;
  othersReadId: number;
  unread: number;
  memberCount: number;
  peer?: User;
  lastMessage?: Message;
  saved?: boolean;
}

export interface PublicConfig {
  appName: string;
  tagline: string;
  logoMedia: string;
  backgroundMedia: string;
  accentColor: string;
  defaultLang: "fa" | "en";
  defaultTheme: "dark" | "light" | "auto";
  welcomeText: string;
  registration: "open" | "invite" | "closed";
  minPasswordLen: number;
  allowUserRooms: boolean;
  maxImageMB: number;
  maxVideoMB: number;
  maxFileMB: number;
  maxMessageLen: number;
  clientCacheMessages: number;
  mediaCacheDays: number;
  callsEnabled: boolean;
  videoCallsEnabled: boolean;
  adsEnabled: boolean;
  adsChannelEvery: number;
  setupRequired: boolean;
  version: string;
  copyright: string;
}

export interface Ad {
  /** number for the server's own ads, "net:<id>" for NeoAurora network ads */
  id: number | string;
  source?: "network";
  badge?: string;
  title: string;
  body: string;
  image: string;
  link: string;
  cta: string;
  placement: "all" | "chatlist" | "channel" | "sidebar" | "chattop" | "admin";
  active: boolean;
  priority: number;
  startsAt: number;
  endsAt: number;
  impressions?: number;
  clicks?: number;
  createdAt?: number;
}

export interface RoomPreview {
  id: number;
  type: ChatType;
  title: string;
  handle: string;
  description: string;
  avatar: string;
  memberCount: number;
  isMember: boolean;
}

export interface CallEntry {
  id: string;
  chatId: number;
  outgoing: boolean;
  peer: User;
  video: boolean;
  status: "ended" | "missed" | "rejected" | "cancelled";
  startedAt: number;
  answeredAt: number;
  endedAt: number;
}

export interface Member {
  user: User;
  role: "owner" | "admin" | "member";
  joinedAt: number;
}
