import { useState } from "react";
import { Menu } from "../components/ui";
import { useT } from "../i18n";
import { useApp } from "../store";
import { NewRoomModal } from "./NewRoomModal";

/** "New message / group / channel" menu, shared by the desktop list header and the mobile FAB. */
export function useNewMenu() {
  const t = useT();
  const config = useApp((s) => s.config);
  const me = useApp((s) => s.me);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [create, setCreate] = useState<"group" | "channel" | null>(null);
  const canRooms = !!config?.allowUserRooms || !!me?.isAdmin;
  const open = (anchor: HTMLElement, above = false) => {
    const r = anchor.getBoundingClientRect();
    const x = Math.min(Math.max(8, r.left + r.width / 2 - 105), window.innerWidth - 218);
    setPos({ x, y: above ? r.top - 190 : r.bottom + 6 });
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
          ]}
        />
      )}
      {create && <NewRoomModal type={create} onClose={() => setCreate(null)} />}
    </>
  );
  return { open, element };
}
