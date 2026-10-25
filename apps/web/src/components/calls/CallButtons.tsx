import { Button } from "@neochat/ui";
import { useI18n } from "../../i18n/I18nProvider";
import { useCallActions } from "../../hooks/useCalls";
import { useCallStore } from "../../stores/calls";

interface CallButtonsProps {
  chatId: string;
}

export function CallButtons({ chatId }: CallButtonsProps) {
  const { t } = useI18n();
  const meta = useCallStore((s) => s.meta);
  const { startAndJoin } = useCallActions();

  if (!meta?.flags.voice) return null;

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        className="nc-btn--sm"
        title={t("calls.voice")}
        aria-label={t("calls.voice")}
        onClick={() => void startAndJoin(chatId, false)}
      >
        📞
      </Button>
      {meta.flags.video ? (
        <Button
          type="button"
          variant="ghost"
          className="nc-btn--sm"
          title={t("calls.video")}
          aria-label={t("calls.video")}
          onClick={() => void startAndJoin(chatId, true)}
        >
          📹
        </Button>
      ) : null}
    </div>
  );
}
