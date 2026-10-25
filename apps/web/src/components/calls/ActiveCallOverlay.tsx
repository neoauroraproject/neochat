import {
  ConnectionQuality,
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrackPublication,
} from "livekit-client";
import { Button, Text } from "@neochat/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { useCallActions } from "../../hooks/useCalls";
import {
  getDefaultCamId,
  getDefaultMicId,
  listMediaDevices,
  setDefaultCamId,
  setDefaultMicId,
} from "../../lib/call-devices";
import { useCallStore } from "../../stores/calls";

function qualityLabel(q: ConnectionQuality): string {
  switch (q) {
    case ConnectionQuality.Excellent:
      return "Excellent";
    case ConnectionQuality.Good:
      return "Good";
    case ConnectionQuality.Poor:
      return "Poor";
    default:
      return "Unknown";
  }
}

function attachTrack(
  container: HTMLDivElement | null,
  track: Track | undefined,
  mirror = false,
): () => void {
  if (!container || !track) return () => undefined;
  const el = track.attach();
  if (el instanceof HTMLVideoElement) {
    el.playsInline = true;
    el.autoplay = true;
    if (mirror) el.style.transform = "scaleX(-1)";
  }
  container.replaceChildren(el);
  return () => {
    track.detach(el);
    el.remove();
  };
}

export function ActiveCallOverlay() {
  const { t } = useI18n();
  const active = useCallStore((s) => s.active);
  const meta = useCallStore((s) => s.meta);
  const { endCall } = useCallActions();

  const roomRef = useRef<Room | null>(null);
  const localVideoRef = useRef<HTMLDivElement>(null);
  const remoteVideoRef = useRef<HTMLDivElement>(null);

  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [quality, setQuality] = useState(ConnectionQuality.Unknown);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState<string>("");
  const [selectedCam, setSelectedCam] = useState<string>("");
  const [connected, setConnected] = useState(false);

  const cleanupRoom = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      room.removeAllListeners();
      await room.disconnect();
    }
  }, []);

  useEffect(() => {
    if (!active) {
      void cleanupRoom();
      return;
    }

    let cancelled = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    const syncRemoteVideo = (participant: RemoteParticipant) => {
      const pub = [...participant.videoTrackPublications.values()].find(
        (p: RemoteTrackPublication) => p.track,
      );
      if (pub?.track) attachTrack(remoteVideoRef.current, pub.track);
    };

    room.on(RoomEvent.TrackSubscribed, (_track, _pub, participant) => {
      syncRemoteVideo(participant);
    });
    room.on(RoomEvent.ParticipantConnected, (participant) => {
      syncRemoteVideo(participant);
    });
    room.on(RoomEvent.ConnectionQualityChanged, (_q, participant) => {
      if (participant?.isLocal) {
        setQuality(participant.connectionQuality);
      }
    });
    room.on(RoomEvent.Disconnected, () => setConnected(false));
    room.on(RoomEvent.Connected, () => setConnected(true));

    void (async () => {
      try {
        await room.connect(active.url, active.token);
        if (cancelled) return;

        const devices = await listMediaDevices();
        setMics(devices.mics);
        setCams(devices.cams);
        const micId = getDefaultMicId() ?? devices.mics[0]?.deviceId ?? "";
        const camId = getDefaultCamId() ?? devices.cams[0]?.deviceId ?? "";
        setSelectedMic(micId);
        setSelectedCam(camId);

        await room.localParticipant.setMicrophoneEnabled(
          true,
          micId ? { deviceId: micId } : undefined,
        );
        if (active.localVideo) {
          await room.localParticipant.setCameraEnabled(
            true,
            camId ? { deviceId: camId } : undefined,
          );
          setCameraOn(true);
          const camTrack = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
          attachTrack(localVideoRef.current, camTrack, true);
        }
        setConnected(true);
      } catch {
        await endCall(active.session.id);
      }
    })();

    return () => {
      cancelled = true;
      void cleanupRoom();
    };
  }, [active, cleanupRoom, endCall]);

  if (!active) return null;

  const room = roomRef.current;

  const toggleMute = async () => {
    if (!room) return;
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  };

  const toggleCamera = async () => {
    if (!room) return;
    const next = !cameraOn;
    await room.localParticipant.setCameraEnabled(
      next,
      selectedCam ? { deviceId: selectedCam } : undefined,
    );
    setCameraOn(next);
    const camTrack = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
    attachTrack(localVideoRef.current, next ? camTrack : undefined, true);
  };

  const toggleScreenShare = async () => {
    if (!room || !meta?.flags.screenShare) return;
    const next = !screenSharing;
    await room.localParticipant.setScreenShareEnabled(next);
    setScreenSharing(next);
    if (next) {
      const screenTrack = room.localParticipant.getTrackPublication(
        Track.Source.ScreenShare,
      )?.track;
      attachTrack(localVideoRef.current, screenTrack);
    } else if (cameraOn) {
      const camTrack = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
      attachTrack(localVideoRef.current, camTrack, true);
    } else {
      localVideoRef.current?.replaceChildren();
    }
  };

  const changeMic = async (deviceId: string) => {
    setSelectedMic(deviceId);
    setDefaultMicId(deviceId);
    if (!room) return;
    await room.localParticipant.setMicrophoneEnabled(true, { deviceId });
    setMuted(false);
  };

  const changeCam = async (deviceId: string) => {
    setSelectedCam(deviceId);
    setDefaultCamId(deviceId);
    if (!room || !cameraOn) return;
    await room.localParticipant.setCameraEnabled(true, { deviceId });
    const camTrack = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
    attachTrack(localVideoRef.current, camTrack, true);
  };

  const hangUp = () => void endCall(active.session.id);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[var(--nc-bg)]">
      <div className="flex-1 relative grid grid-cols-1 md:grid-cols-2 gap-2 p-2">
        <div className="relative bg-black/80 rounded-lg overflow-hidden min-h-[200px]">
          <div
            ref={remoteVideoRef}
            className="w-full h-full [&_video]:w-full [&_video]:h-full [&_video]:object-cover"
          />
          {!connected ? (
            <Text className="absolute inset-0 flex items-center justify-center text-white">
              {t("common.loading")}
            </Text>
          ) : null}
        </div>
        <div className="relative bg-black/60 rounded-lg overflow-hidden min-h-[160px]">
          <div
            ref={localVideoRef}
            className="w-full h-full [&_video]:w-full [&_video]:h-full [&_video]:object-cover"
          />
          {!cameraOn && !screenSharing ? (
            <Text className="absolute inset-0 flex items-center justify-center text-white/70">
              {t("calls.cameraOff")}
            </Text>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 border-t border-[var(--nc-border)] bg-[var(--nc-surface)] p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <Text muted>
            {t("calls.quality")}: {qualityLabel(quality)}
          </Text>
          <div className="flex flex-wrap gap-2">
            {mics.length > 0 ? (
              <select
                className="nc-input nc-input--sm"
                value={selectedMic}
                onChange={(e) => void changeMic(e.target.value)}
                aria-label={t("calls.microphone")}
              >
                {mics.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || t("calls.microphone")}
                  </option>
                ))}
              </select>
            ) : null}
            {cams.length > 0 && meta?.flags.video ? (
              <select
                className="nc-input nc-input--sm"
                value={selectedCam}
                onChange={(e) => void changeCam(e.target.value)}
                aria-label={t("calls.camera")}
              >
                {cams.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || t("calls.camera")}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            variant={muted ? "danger" : "ghost"}
            onClick={() => void toggleMute()}
          >
            {muted ? t("calls.unmute") : t("calls.mute")}
          </Button>
          {meta?.flags.video ? (
            <Button type="button" variant="ghost" onClick={() => void toggleCamera()}>
              {cameraOn ? t("calls.cameraOff") : t("calls.cameraOn")}
            </Button>
          ) : null}
          {meta?.flags.screenShare ? (
            <Button type="button" variant="ghost" onClick={() => void toggleScreenShare()}>
              {screenSharing ? t("calls.stopShare") : t("calls.shareScreen")}
            </Button>
          ) : null}
          <Button type="button" variant="danger" onClick={hangUp}>
            {t("calls.hangUp")}
          </Button>
        </div>
      </div>
    </div>
  );
}
