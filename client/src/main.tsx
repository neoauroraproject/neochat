import { registerServiceWorker } from "./update";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/app.css";
import "./styles/mobile.css";
import "./styles/calls.css";
import "./styles/motion.css";
import "./styles/appearance.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The service worker caches the app shell and media so the messenger opens without a connection.
registerServiceWorker();

// iOS scrolls the whole page up to make room for the keyboard and sometimes leaves it there after
// the keyboard closes, which shows a band under the app. The app never scrolls as a page.
const settle = () =>
  window.setTimeout(() => {
    const el = document.activeElement as HTMLElement | null;
    // While typing, the page may sit higher on purpose so the field stays above the keyboard.
    if (el?.matches("input, textarea, [contenteditable]")) return;
    if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
  }, 120);
document.addEventListener("focusout", settle);
window.visualViewport?.addEventListener("resize", settle);
