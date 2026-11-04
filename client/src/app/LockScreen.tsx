import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { tryPin, unlockWithBiometrics, useAppLock } from "../applock";
import { Icon } from "../components/Icon";
import { BrandLogo } from "../components/ui";
import { useT } from "../i18n";
import { useTick } from "./hooks";

/** The keypad shown while the app is locked; Face ID / fingerprint is offered first when set up. */
export function LockScreen() {
  const t = useT();
  const { config, locked, pausedUntil } = useAppLock();
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  useTick(pausedUntil > Date.now() ? 1000 : 0);
  const paused = pausedUntil > Date.now();

  useEffect(() => {
    if (locked && config?.credId) unlockWithBiometrics();
  }, [locked, config?.credId]);
  useEffect(() => {
    if (!locked) setPin("");
  }, [locked]);

  const press = async (d: string) => {
    if (paused || !config) return;
    const next = (pin + d).slice(0, config.digits);
    setPin(next);
    if (next.length === config.digits) {
      if (!(await tryPin(next))) {
        setShake(true);
        navigator.vibrate?.([40, 60, 40]);
        window.setTimeout(() => {
          setShake(false);
          setPin("");
        }, 420);
      }
    }
  };

  useEffect(() => {
    if (!locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!locked || !config) return null;
  return createPortal(
    <div className="lock-screen" role="dialog" aria-label={t("applock.title")}>
      <BrandLogo size={64} />
      <h2>{t("applock.enter")}</h2>
      <div className={`pin-dots${shake ? " shake" : ""}`}>
        {Array.from({ length: config.digits }, (_, i) => (
          <i key={i} className={i < pin.length ? "on" : ""} />
        ))}
      </div>
      <div className="pin-msg">
        {paused ? t("applock.paused", { n: Math.ceil((pausedUntil - Date.now()) / 1000) }) : ""}
      </div>
      <div className="pin-pad" dir="ltr">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} onClick={() => press(d)} disabled={paused}>
            {d}
          </button>
        ))}
        {config.credId ? (
          <button onClick={() => unlockWithBiometrics()} aria-label={t("applock.biometric")}>
            <Icon name="shield" size={24} />
          </button>
        ) : (
          <span />
        )}
        <button onClick={() => press("0")} disabled={paused}>
          0
        </button>
        <button onClick={() => setPin((p) => p.slice(0, -1))} aria-label={t("common.delete")}>
          <Icon name="back" size={22} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
