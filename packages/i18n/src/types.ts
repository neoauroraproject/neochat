export const SUPPORTED_LOCALES = ["en", "fa", "ar", "tr", "ru"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const RTL_LOCALES: ReadonlyArray<Locale> = ["fa", "ar"];

export interface LocaleMeta {
  code: Locale;
  name: string;
  nativeName: string;
  dir: "ltr" | "rtl";
}

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  en: { code: "en", name: "English", nativeName: "English", dir: "ltr" },
  fa: { code: "fa", name: "Persian", nativeName: "فارسی", dir: "rtl" },
  ar: { code: "ar", name: "Arabic", nativeName: "العربية", dir: "rtl" },
  tr: { code: "tr", name: "Turkish", nativeName: "Türkçe", dir: "ltr" },
  ru: { code: "ru", name: "Russian", nativeName: "Русский", dir: "ltr" },
};

/** The canonical set of translatable UI string keys. */
export interface Messages {
  "app.name": string;
  "common.ok": string;
  "common.cancel": string;
  "common.save": string;
  "common.delete": string;
  "common.edit": string;
  "common.search": string;
  "common.loading": string;
  "common.retry": string;
  "common.settings": string;
  "common.language": string;
  "common.theme": string;
  "common.theme.light": string;
  "common.theme.dark": string;
  "common.back": string;
  "common.next": string;
  "common.finish": string;

  "auth.login": string;
  "auth.logout": string;
  "auth.register": string;
  "auth.username": string;
  "auth.password": string;
  "auth.displayName": string;
  "auth.inviteCode": string;
  "auth.signIn": string;
  "auth.signInError": string;
  "auth.setupTitle": string;
  "auth.setupSubtitle": string;
  "auth.createAdmin": string;

  "setup.welcome.title": string;
  "setup.welcome.subtitle": string;
  "setup.organization.title": string;
  "setup.organization.subtitle": string;
  "setup.organization.instanceName": string;
  "setup.organization.defaultLocale": string;
  "setup.organization.allowRegistration": string;
  "setup.administrator.title": string;
  "setup.administrator.subtitle": string;
  "setup.httpPort.title": string;
  "setup.httpPort.subtitle": string;
  "setup.httpPort.host": string;
  "setup.httpPort.port": string;
  "setup.storage.title": string;
  "setup.storage.subtitle": string;
  "setup.storage.driver": string;
  "setup.storage.path": string;
  "setup.finish.title": string;
  "setup.finish.subtitle": string;
  "setup.finish.launch": string;

  "nav.home": string;
  "nav.settings": string;

  "home.title": string;
  "home.ready": string;
  "home.subtitle": string;

  "settings.title": string;
  "settings.profile": string;
  "settings.devices": string;
  "settings.privacy": string;
  "settings.privacyStub": string;
  "settings.notifications": string;
  "settings.storage": string;
  "settings.sound": string;
  "settings.browserNotifications": string;
  "settings.autoDownload": string;
  "settings.currentDevice": string;
  "settings.revoke": string;
  "settings.noDevices": string;

  "chat.list": string;
  "chat.searchChats": string;
  "chat.searchUsers": string;
  "chat.title": string;
  "chat.new.dm": string;
  "chat.new.group": string;
  "chat.new.channel": string;
  "chat.empty.title": string;
  "chat.empty.subtitle": string;
  "chat.selectChat": string;
  "chat.selectChatHint": string;
  "chat.noMessages": string;
  "chat.noMessagesHint": string;
  "chat.composePlaceholder": string;
  "chat.send": string;
  "chat.sendHint": string;
  "chat.typing": string;
  "chat.online": string;
  "chat.lastSeen": string;
  "chat.reply": string;
  "chat.replying": string;
  "chat.forward": string;
  "chat.copy": string;
  "chat.pin": string;
  "chat.unpin": string;
  "chat.edited": string;
  "chat.attach": string;
  "chat.voice": string;
  "chat.selectMessage": string;
  "chat.newMessage": string;
  "chat.decryptFailed": string;

  "calls.voice": string;
  "calls.video": string;
  "calls.incoming": string;
  "calls.accept": string;
  "calls.decline": string;
  "calls.hangUp": string;
  "calls.mute": string;
  "calls.unmute": string;
  "calls.cameraOn": string;
  "calls.cameraOff": string;
  "calls.shareScreen": string;
  "calls.stopShare": string;
  "calls.microphone": string;
  "calls.camera": string;
  "calls.quality": string;
  "calls.settings": string;
  "calls.history": string;
  "calls.noHistory": string;
  "calls.participants": string;
  "calls.defaultMic": string;
  "calls.defaultCam": string;
  "calls.systemDefault": string;
  "calls.disabled": string;

  "error.title": string;
  "error.message": string;
  "error.retry": string;

  "notFound.title": string;
  "notFound.message": string;
  "notFound.back": string;

  "admin.dashboard": string;
  "admin.users": string;
  "admin.invites": string;
  "admin.diagnostics": string;
  "admin.featureFlags": string;
  "admin.config": string;
  "admin.tls": string;
  "admin.retention": string;
  "admin.backup": string;
  "admin.performance": string;
  "admin.maintenance": string;
  "admin.settings": string;
  "admin.plugins": string;
  "admin.audit": string;
  "admin.instance": string;
  "admin.instanceHint": string;
  "admin.instanceInfo": string;
  "admin.instanceSettings": string;
  "admin.pluginHost": string;
  "admin.noPlugins": string;
}

export type MessageKey = keyof Messages;
