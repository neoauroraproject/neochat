import type { CallDevicesMeta, CallHistoryEntry, CallInvite, CallSession } from "@neochat/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { apiFetch } from "../lib/api";
import { setRealtimeHandlers } from "../lib/ws";
import { useCallStore } from "../stores/calls";
import { useAuthStore } from "../stores/stores";

export function useCallMeta() {
  const setMeta = useCallStore((s) => s.setMeta);
  const query = useQuery({
    queryKey: ["calls-meta"],
    queryFn: () => apiFetch<CallDevicesMeta>("/calls/devices-meta"),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (query.data) setMeta(query.data);
  }, [query.data, setMeta]);

  return query;
}

export function useCallHistory(chatId?: string) {
  return useQuery({
    queryKey: ["calls-history", chatId ?? "all"],
    queryFn: () => {
      const qs = chatId ? `?chatId=${encodeURIComponent(chatId)}` : "";
      return apiFetch<CallHistoryEntry[]>(`/calls/history${qs}`);
    },
  });
}

export function useStartCall() {
  return useMutation({
    mutationFn: (body: { chatId: string; video: boolean; screenShareReady?: boolean }) =>
      apiFetch<CallSession>("/calls", { method: "POST", body: JSON.stringify(body) }),
  });
}

export function useCallActions() {
  const userId = useAuthStore((s) => s.user?.id);
  const setIncoming = useCallStore((s) => s.setIncoming);
  const setActive = useCallStore((s) => s.setActive);
  const clear = useCallStore((s) => s.clear);

  const joinCall = useCallback(
    async (session: CallSession, withVideo?: boolean) => {
      await apiFetch(`/calls/${session.id}/accept`, {
        method: "POST",
        body: JSON.stringify({ video: withVideo ?? session.video }),
      });
      const tokenResp = await apiFetch<{ token: string; url: string }>(
        `/calls/${session.id}/token`,
      );
      setIncoming(null);
      setActive({
        session,
        token: tokenResp.token,
        url: tokenResp.url,
        localVideo: withVideo ?? session.video,
      });
    },
    [setActive, setIncoming],
  );

  const startAndJoin = useCallback(
    async (chatId: string, video: boolean) => {
      const session = await apiFetch<CallSession>("/calls", {
        method: "POST",
        body: JSON.stringify({ chatId, video }),
      });
      const activeSession = await apiFetch<CallSession>(`/calls/${session.id}/accept`, {
        method: "POST",
        body: JSON.stringify({ video }),
      });
      const tokenResp = await apiFetch<{ token: string; url: string }>(
        `/calls/${session.id}/token`,
      );
      setActive({
        session: activeSession,
        token: tokenResp.token,
        url: tokenResp.url,
        localVideo: video,
      });
      return activeSession;
    },
    [setActive],
  );

  const acceptIncoming = useCallback(
    async (invite: CallInvite, withVideo?: boolean) => {
      const session = await apiFetch<CallSession>(`/calls/${invite.callId}/accept`, {
        method: "POST",
        body: JSON.stringify({ video: withVideo ?? invite.video }),
      });
      const tokenResp = await apiFetch<{ token: string; url: string }>(
        `/calls/${invite.callId}/token`,
      );
      setIncoming(null);
      setActive({
        session,
        token: tokenResp.token,
        url: tokenResp.url,
        localVideo: withVideo ?? invite.video,
      });
    },
    [setActive, setIncoming],
  );

  const rejectIncoming = useCallback(
    async (callId: string) => {
      await apiFetch(`/calls/${callId}/reject`, { method: "POST", body: "{}" });
      setIncoming(null);
    },
    [setIncoming],
  );

  const endCall = useCallback(
    async (callId: string) => {
      await apiFetch(`/calls/${callId}/end`, { method: "POST", body: "{}" });
      clear();
    },
    [clear],
  );

  const handleInvite = useCallback(
    (invite: CallInvite) => {
      if (invite.initiatedBy === userId) return;
      setIncoming(invite);
    },
    [setIncoming, userId],
  );

  const handleEnd = useCallback(
    (data: { callId: string; session: CallSession }) => {
      const active = useCallStore.getState().active;
      const incoming = useCallStore.getState().incoming;
      if (active?.session.id === data.callId || incoming?.callId === data.callId) {
        clear();
      }
    },
    [clear],
  );

  const handleReject = useCallback(
    (data: { callId: string; userId: string }) => {
      const incoming = useCallStore.getState().incoming;
      if (incoming?.callId === data.callId && data.userId !== userId) {
        setIncoming(null);
      }
    },
    [setIncoming, userId],
  );

  return {
    startAndJoin,
    joinCall,
    acceptIncoming,
    rejectIncoming,
    endCall,
    handleInvite,
    handleEnd,
    handleReject,
  };
}

export function useCallSync() {
  const { handleInvite, handleEnd, handleReject } = useCallActions();

  useEffect(() => {
    setRealtimeHandlers({
      onCallInvite: handleInvite,
      onCallEnd: (data) => handleEnd(data),
      onCallReject: handleReject,
    });
  }, [handleEnd, handleInvite, handleReject]);
}
