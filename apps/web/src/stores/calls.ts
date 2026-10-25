import type { CallDevicesMeta, CallInvite, CallSession } from "@neochat/shared";
import { create } from "zustand";

export type ActiveCallState = {
  session: CallSession;
  token: string;
  url: string;
  localVideo: boolean;
};

interface CallStore {
  meta: CallDevicesMeta | null;
  incoming: CallInvite | null;
  active: ActiveCallState | null;
  setMeta: (meta: CallDevicesMeta) => void;
  setIncoming: (invite: CallInvite | null) => void;
  setActive: (active: ActiveCallState | null) => void;
  clear: () => void;
}

export const useCallStore = create<CallStore>((set) => ({
  meta: null,
  incoming: null,
  active: null,
  setMeta: (meta) => set({ meta }),
  setIncoming: (incoming) => set({ incoming }),
  setActive: (active) => set({ active }),
  clear: () => set({ incoming: null, active: null }),
}));
