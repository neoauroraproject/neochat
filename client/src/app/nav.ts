import { useApp } from "../store";

/** Pops the top screen: through browser history when we pushed an entry (so the system back stays in sync). */
export function goBack() {
  if (history.state && history.state.chat) history.back();
  else useApp.getState().openChat(null);
}
