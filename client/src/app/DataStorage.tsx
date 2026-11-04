import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { fileSize } from "../format";
import { useT } from "../i18n";
import { useApp } from "../store";
import {
  clearMedia,
  mediaKeepDays,
  mediaStats,
  persistStorage,
  setMediaKeepDays,
  type MediaStats,
} from "../update";

const KINDS = [
  { k: "image", icon: "image", key: "data.photos", color: "#30d158" },
  { k: "video", icon: "video", key: "data.videos", color: "#ff9f0a" },
  { k: "audio", icon: "mic", key: "data.audio", color: "#bf5af2" },
  { k: "file", icon: "file", key: "data.files", color: "#0a84ff" },
] as const;

/**
 * Settings → "Storage & data": what the phone keeps for offline use, per kind, with a clear
 * button each, how long media is kept, and whether the browser promised not to evict it.
 */
export function DataStorage() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const [stats, setStats] = useState<MediaStats | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [days, setDays] = useState(mediaKeepDays());
  const [persisted, setPersisted] = useState<boolean | null>(null);

  const refresh = () => {
    mediaStats().then(setStats);
    navigator.storage
      ?.estimate?.()
      .then((e) => setTotal(e.usage ?? null))
      .catch(() => {});
  };
  useEffect(() => {
    refresh();
    navigator.storage
      ?.persisted?.()
      .then(setPersisted)
      .catch(() => setPersisted(null));
  }, []);

  const clear = async (k: (typeof KINDS)[number]["k"]) => {
    const r = await clearMedia(k);
    if (r) setStats(r);
    refresh();
  };

  return (
    <>
      <div className="section-label">{t("data.title")}</div>
      <div className="card-group data-storage">
        {total !== null && (
          <div className="item">
            <span className="item-icon" style={{ background: "#64d2ff" }}>
              <Icon name="database" size={18} />
            </span>
            <div className="grow">
              <div>{t("data.onDevice", { size: fileSize(total, lang) })}</div>
              {stats && (
                <div className="muted">
                  {t("data.budget", { size: fileSize(stats.budget, lang) })}
                </div>
              )}
            </div>
          </div>
        )}
        {stats &&
          KINDS.map((x) => (
            <div className="item" key={x.k}>
              <span className="item-icon" style={{ background: x.color }}>
                <Icon name={x.icon} size={17} />
              </span>
              <div className="grow">
                {t(x.key)}
                <div className="muted">
                  <bdi>{fileSize(stats[x.k], lang)}</bdi>
                </div>
              </div>
              {stats[x.k] > 0 && (
                <button className="btn btn-sm" onClick={() => clear(x.k)}>
                  {t("data.clear")}
                </button>
              )}
            </div>
          ))}
        <div className="item">
          <span className="item-icon" style={{ background: "#ff375f" }}>
            <Icon name="clock" size={17} />
          </span>
          <div className="grow">{t("data.keep")}</div>
          <div className="segmented small">
            {[
              [7, t("data.week")],
              [30, t("data.month")],
              [0, t("data.forever")],
            ].map(([d, label]) => (
              <button
                key={d}
                aria-pressed={days === d}
                onClick={() => {
                  setDays(d as number);
                  setMediaKeepDays(d as number);
                  window.setTimeout(refresh, 600);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="item">
          <span className="item-icon" style={{ background: persisted ? "#30d158" : "#8e8e93" }}>
            <Icon name="shield" size={17} />
          </span>
          <div className="grow">
            {t(persisted ? "data.persisted" : "data.notPersisted")}
            <div className="muted">{t("data.persistHint")}</div>
          </div>
          {!persisted && (
            <button
              className="btn btn-sm"
              onClick={async () => setPersisted(await persistStorage())}
            >
              {t("data.persist")}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
