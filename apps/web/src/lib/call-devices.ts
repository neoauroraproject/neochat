const MIC_KEY = "neochat:call:mic";
const CAM_KEY = "neochat:call:cam";

export function getDefaultMicId(): string | null {
  return localStorage.getItem(MIC_KEY);
}

export function getDefaultCamId(): string | null {
  return localStorage.getItem(CAM_KEY);
}

export function setDefaultMicId(deviceId: string | null): void {
  if (deviceId) localStorage.setItem(MIC_KEY, deviceId);
  else localStorage.removeItem(MIC_KEY);
}

export function setDefaultCamId(deviceId: string | null): void {
  if (deviceId) localStorage.setItem(CAM_KEY, deviceId);
  else localStorage.removeItem(CAM_KEY);
}

export async function listMediaDevices(): Promise<{
  mics: MediaDeviceInfo[];
  cams: MediaDeviceInfo[];
}> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return { mics: [], cams: [] };
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return {
    mics: devices.filter((d) => d.kind === "audioinput"),
    cams: devices.filter((d) => d.kind === "videoinput"),
  };
}
