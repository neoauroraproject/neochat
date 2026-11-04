import { useState } from "react";
import { Menu } from "../components/ui";
import { useT } from "../i18n";
import { useApp } from "../store";
import { NewRoomModal } from "./NewRoomModal";
import { QrModal } from "./QrModal";

/** "New message / group / channel" menu, shared by the desktop list header and the mobile FAB. */
export function useNewMenu() {
  const t = useT();
  const config = useApp((s) => s.config);
  const me = useApp((s) => s.me);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [create, setCreate] = useState<"group" | "channel" | null>(null);
  const [qr, setQr] = useState(false);
  const canRooms = !!config?.allowUserRooms || !!me?.isAdmin;
  const open = (anchor: HTMLElement, above = false) => {
    const r = anchor.getBoundingClientRect();
    const x = Math.min(Math.max(8, r.left + r.width / 2 - 105), window.innerWidth - 218);
    setPos({ x, y: above ? r.top - 236 : r.bottom + 6 });
  };
  const element = (
    <>
      {pos && (
        <Menu
          x={pos.x}
          y={pos.y}
          onClose={() => setPos(null)}
          items={[
            {
              icon: "chat",
              label: t("list.newChat"),
              onClick: () => useApp.setState({ section: "explore" }),
            },
            {
              icon: "group",
              label: t("list.newGroup"),
              onClick: () => setCreate("group"),
              hidden: !canRooms,
            },
            {
              icon: "megaphone",
              label: t("list.newChannel"),
              onClick: () => setCreate("channel"),
              hidden: !canRooms,
            },
            {
              icon: "bookmark",
              label: t("list.saved"),
              onClick: () => me && useApp.getState().openDirect(me.id),
            },
            { icon: "camera", label: t("qr.addByQr"), onClick: () => setQr(true) },
          ]}
        />
      )}
      {create && <NewRoomModal type={create} onClose={() => setCreate(null)} />}
      {qr && <QrModal onClose={() => setQr(false)} />}
    </>
  );
  return { open, element };
}
