import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { Modal } from "../components/ui";
import { useT } from "../i18n";
import { enablePush, pushSupported, setPref } from "../notify";
import { isIOS, isIOSSafari, shouldOfferInstall, usePwa } from "../pwa";
import { useApp } from "../store";

/**
 * "Install the app" guide, shown once on the first sign-in and from Settings. On iPhone the web app
 * only gets notifications once it is added to the home screen from Safari, so that is the advice there.
 */
export function InstallGuide() {
  const t = useT();
  const app = useApp((s) => s.config?.appName) || "NeoChat";
  const { guideOpen, deferred, closeGuide, install } = usePwa();

  const [askNotify, setAskNotify] = useState(false);
  useEffect(() => {
    if (guideOpen) return;
    const offer = shouldOfferInstall();
    const id = window.setTimeout(
      () => (offer ? usePwa.getState().openGuide() : setAskNotify(shouldAskNotify())),
      offer ? 1500 : 800,
    );
    return () => window.clearTimeout(id);
  }, [guideOpen]);

  if (askNotify) return <NotifyPrompt onClose={() => setAskNotify(false)} />;
  if (!guideOpen) return null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.origin + "/");
      useApp.getState().toast(t("common.copied"));
    } catch {
      /* clipboard blocked; the address bar still shows it */
    }
  };

  let body: React.ReactNode;
  let footer: React.ReactNode;
  if (isIOSSafari) {
    body = (
      <ol className="install-steps">
        <li>
          <span className="install-num">1</span>
          <span>
            {t("install.iosShare")} <Icon name="share" size={18} className="install-inline" />
          </span>
        </li>
        <li>
          <span className="install-num">2</span>
          <span>
            {t("install.iosAdd")} <Icon name="plus-square" size={18} className="install-inline" />
          </span>
        </li>
        <li>
          <span className="install-num">3</span>
          <span>{t("install.iosOpen", { app })}</span>
        </li>
      </ol>
    );
    footer = (
      <button className="btn btn-primary btn-block" onClick={closeGuide}>
        {t("common.done")}
      </button>
    );
  } else if (isIOS) {
    body = (
      <div className="install-warn">
        <Icon name="alert" size={20} />
        <span>{t("install.iosNotSafari", { app })}</span>
      </div>
    );
    footer = (
      <>
        <button className="btn" onClick={closeGuide}>
          {t("install.later")}
        </button>
        <button className="btn btn-primary" onClick={copyLink}>
          {t("install.copyLink")}
        </button>
      </>
    );
  } else if (deferred) {
    body = null;
    footer = (
      <>
        <button className="btn" onClick={closeGuide}>
          {t("install.later")}
        </button>
        <button
          className="btn btn-primary"
          onClick={async () => {
            await install();
            closeGuide();
          }}
        >
          {t("settings.install")}
        </button>
      </>
    );
  } else {
    body = <p className="install-text">{t("install.menu")}</p>;
    footer = (
      <button className="btn btn-primary btn-block" onClick={closeGuide}>
        {t("common.done")}
      </button>
    );
  }

  return (
    <Modal title={t("install.title", { app })} onClose={closeGuide} footer={footer}>
      <div className="install-guide">
        <span className="install-icon">
          <img src="/icon.svg" alt="" width={56} height={56} />
        </span>
        <p className="install-text">{t("install.intro", { app })}</p>
        {body}
        {isIOS && (
          <div className="install-note">
            <Icon name="bell" size={18} />
            <span>{t("install.iosNotify")}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}

const ASKED_KEY = "neochat.notifyAsked";

/** Ask once per device, and only where push works (on iPhone: once opened from the home screen). */
function shouldAskNotify(): boolean {
  if (!pushSupported() || Notification.permission !== "default") return false;
  try {
    return localStorage.getItem(ASKED_KEY) !== "1";
  } catch {
    return false;
  }
}

/** The permission request has to come from a tap, so it sits behind this button (required on iOS). */
function NotifyPrompt({ onClose }: { onClose: () => void }) {
  const t = useT();
  const close = () => {
    try {
      localStorage.setItem(ASKED_KEY, "1");
    } catch {
      /* private mode */
    }
    onClose();
  };
  const enable = async () => {
    const p = await Notification.requestPermission();
    if (p === "granted") {
      setPref("notify", true);
      enablePush();
    }
    close();
  };
  return (
    <Modal
      title={t("notify.title")}
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            {t("install.later")}
          </button>
          <button className="btn btn-primary" onClick={enable}>
            {t("notify.enable")}
          </button>
        </>
      }
    >
      <div className="install-guide">
        <span className="install-bell">
          <Icon name="bell" size={30} />
        </span>
        <p className="install-text">{t("notify.body")}</p>
      </div>
    </Modal>
  );
}
