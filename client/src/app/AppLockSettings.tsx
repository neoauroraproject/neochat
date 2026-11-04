import { useEffect, useState } from "react";
import {
  biometricsAvailable,
  disableBiometrics,
  disableLock,
  enableBiometrics,
  enableLock,
  setLockAfter,
  useAppLock,
} from "../applock";
import { Icon } from "../components/Icon";
import { Modal, Toggle } from "../components/ui";
import { useT } from "../i18n";
import { useApp } from "../store";

/** Settings → Privacy: app lock with a code, Face ID / fingerprint, and when to lock. */
export function AppLockSettings() {
  const t = useT();
  const me = useApp((s) => s.me);
  const config = useAppLock((s) => s.config);
  const [setting, setSetting] = useState(false);
  const [bio, setBio] = useState(false);
  useEffect(() => {
    biometricsAvailable().then(setBio);
  }, []);
  return (
    <>
      <div className="section-label">{t("applock.section")}</div>
      <div className="card-group">
        <div className="item">
          <span className="item-icon" style={{ background: "#5e5ce6" }}>
            <Icon name="lock" size={17} />
          </span>
          <div className="grow">
            {t("applock.title")}
            <div className="muted">{t("applock.explain")}</div>
          </div>
          <Toggle
            checked={!!config}
            onChange={(v) => (v ? setSetting(true) : disableLock())}
            label={t("applock.title")}
          />
        </div>
        {config && (
          <>
            <div className="item">
              <span className="item-icon" style={{ background: "#8e8e93" }}>
                <Icon name="clock" size={17} />
              </span>
              <div className="grow">{t("applock.after")}</div>
              <select
                className="select"
                value={config.afterMin}
                onChange={(e) => setLockAfter(Number(e.target.value))}
              >
                <option value={0}>{t("applock.immediately")}</option>
                <option value={1}>{t("applock.min", { n: 1 })}</option>
                <option value={5}>{t("applock.min", { n: 5 })}</option>
                <option value={60}>{t("applock.hour")}</option>
              </select>
            </div>
            {bio && (
              <div className="item">
                <span className="item-icon" style={{ background: "#30d158" }}>
                  <Icon name="shield" size={17} />
                </span>
                <div className="grow">{t("applock.biometric")}</div>
                <Toggle
                  checked={!!config.credId}
                  onChange={async (v) => {
                    if (!v) return disableBiometrics();
                    const ok = await enableBiometrics(me?.username || "neochat");
                    if (!ok) useApp.getState().toast(t("applock.bioFailed"), "error");
                  }}
                  label={t("applock.biometric")}
                />
              </div>
            )}
            <button className="item" onClick={() => setSetting(true)}>
              <Icon name="edit" size={17} />
              {t("applock.change")}
            </button>
          </>
        )}
      </div>
      {setting && <SetPin onClose={() => setSetting(false)} />}
    </>
  );
}

function SetPin({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [digits, setDigits] = useState<4 | 6>(4);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const after = useAppLock((s) => s.config?.afterMin ?? 1);
  const valid = new RegExp(`^\\d{${digits}}$`).test(a) && a === b;
  return (
    <Modal
      title={t("applock.setTitle")}
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary"
          style={{ width: "100%" }}
          disabled={!valid}
          onClick={async () => {
            await enableLock(a, digits, after);
            onClose();
          }}
        >
          {t("common.save")}
        </button>
      }
    >
      <div className="lock-compose">
        <div className="segmented">
          {([4, 6] as const).map((d) => (
            <button key={d} aria-pressed={digits === d} onClick={() => setDigits(d)}>
              {t("applock.digits", { n: d })}
            </button>
          ))}
        </div>
        <input
          className="input pin-input"
          inputMode="numeric"
          type="password"
          maxLength={digits}
          value={a}
          onChange={(e) => setA(e.target.value.replace(/\D/g, ""))}
          placeholder={t("applock.code")}
        />
        <input
          className="input pin-input"
          inputMode="numeric"
          type="password"
          maxLength={digits}
          value={b}
          onChange={(e) => setB(e.target.value.replace(/\D/g, ""))}
          placeholder={t("applock.repeat")}
        />
        {b.length === digits && a !== b && <div className="field-err">{t("lock.mismatch")}</div>}
      </div>
    </Modal>
  );
}
