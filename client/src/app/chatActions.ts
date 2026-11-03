import { del, post } from "../api";
import { confirmAction } from "../components/sheet";
import { errorText, translate } from "../i18n";
import { useApp } from "../store";
import type { Chat } from "../types";

/**
 * What "remove" means for a chat depends on its type and the user's role:
 * private chats are deleted for both people, rooms are left, and a room's owner deletes it.
 * Always confirmed with an action sheet, never applied silently.
 */
export function askRemoveChat(c: Chat, afterRemove?: () => void) {
  const lang = useApp.getState().lang;
  const t = (k: Parameters<typeof translate>[1]) => translate(lang, k);
  const owner = c.type !== "direct" && c.role === "owner";
  const leave = c.type !== "direct" && !owner;

  const run = async () => {
    try {
      if (leave) await post(`/api/chats/${c.id}/leave`);
      else await del(`/api/chats/${c.id}`);
      useApp.getState().removeChat(c.id);
      afterRemove?.();
    } catch (e) {
      useApp.getState().toast(errorText(lang, e), "error");
    }
  };

  confirmAction(
    leave
      ? { title: t("sheet.leaveTitle"), message: t("sheet.leaveBody"), label: t("room.leave"), run }
      : owner
        ? {
            title: t("sheet.deleteRoomTitle"),
            message: t("sheet.deleteRoomBody"),
            label: t("room.delete"),
            run,
          }
        : {
            title: t("sheet.deleteChatTitle"),
            message: t("sheet.deleteChatBody"),
            label: t("list.deleteChat"),
            run,
          },
  );
}

export function askDeleteMessage(id: number) {
  const lang = useApp.getState().lang;
  const t = (k: Parameters<typeof translate>[1]) => translate(lang, k);
  confirmAction({
    title: t("sheet.deleteMessageTitle"),
    message: t("sheet.deleteMessageBody"),
    label: t("common.delete"),
    run: () =>
      useApp
        .getState()
        .deleteMessage(id)
        .catch(() => useApp.getState().toast(t("err.generic"), "error")),
  });
}
