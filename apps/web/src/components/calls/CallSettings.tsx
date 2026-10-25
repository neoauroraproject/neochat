import { Card, Spinner, Text } from "@neochat/ui";
import { useI18n } from "../../i18n/I18nProvider";
import { useCallHistory } from "../../hooks/useCalls";
import {
  getDefaultCamId,
  getDefaultMicId,
  listMediaDevices,
  setDefaultCamId,
  setDefaultMicId,
} from "../../lib/call-devices";
import { useCallStore } from "../../stores/calls";
import { useEffect, useState } from "react";

export function CallSettingsPanel() {
  const { t } = useI18n();
  const meta = useCallStore((s) => s.meta);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState(getDefaultMicId() ?? "");
  const [camId, setCamId] = useState(getDefaultCamId() ?? "");

  useEffect(() => {
    void listMediaDevices().then((d) => {
      setMics(d.mics);
      setCams(d.cams);
    });
  }, []);

  if (!meta?.flags.voice) {
    return <Text muted>{t("calls.disabled")}</Text>;
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm mb-1">{t("calls.defaultMic")}</label>
        <select
          className="nc-input w-full max-w-md"
          value={micId}
          onChange={(e) => {
            setMicId(e.target.value);
            setDefaultMicId(e.target.value || null);
          }}
        >
          <option value="">{t("calls.systemDefault")}</option>
          {mics.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || d.deviceId}
            </option>
          ))}
        </select>
      </div>
      {meta.flags.video ? (
        <div>
          <label className="block text-sm mb-1">{t("calls.defaultCam")}</label>
          <select
            className="nc-input w-full max-w-md"
            value={camId}
            onChange={(e) => {
              setCamId(e.target.value);
              setDefaultCamId(e.target.value || null);
            }}
          >
            <option value="">{t("calls.systemDefault")}</option>
            {cams.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || d.deviceId}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}

export function CallHistoryPanel({ chatId }: { chatId?: string }) {
  const { t } = useI18n();
  const history = useCallHistory(chatId);

  if (history.isLoading) return <Spinner />;
  if (!history.data?.length) return <Text muted>{t("calls.noHistory")}</Text>;

  return (
    <ul className="space-y-2 text-sm">
      {history.data.map((entry) => (
        <li key={entry.id} className="p-2 rounded bg-[var(--nc-bg)] flex justify-between gap-2">
          <span>
            {entry.video ? t("calls.video") : t("calls.voice")} · {entry.participants.length}{" "}
            {t("calls.participants")}
          </span>
          <span className="text-[var(--nc-muted)] shrink-0">
            {new Date(entry.endedAt).toLocaleString()}
            {entry.durationSeconds != null ? ` · ${Math.floor(entry.durationSeconds / 60)}m` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CallHistoryCard({ chatId }: { chatId?: string }) {
  const { t } = useI18n();
  return (
    <Card title={t("calls.history")}>
      <CallHistoryPanel chatId={chatId} />
    </Card>
  );
}
