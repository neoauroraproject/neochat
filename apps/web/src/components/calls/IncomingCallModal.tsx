import { Button, Card, Heading, Text } from "@neochat/ui";
import { useI18n } from "../../i18n/I18nProvider";
import { useCallActions } from "../../hooks/useCalls";
import { useCallStore } from "../../stores/calls";

export function IncomingCallModal() {
  const { t } = useI18n();
  const incoming = useCallStore((s) => s.incoming);
  const meta = useCallStore((s) => s.meta);
  const { acceptIncoming, rejectIncoming } = useCallActions();

  if (!incoming) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-sm shadow-xl">
        <Heading level={3}>{t("calls.incoming")}</Heading>
        <Text className="mt-2">
          {incoming.initiatorName} · {incoming.video ? t("calls.video") : t("calls.voice")}
        </Text>
        <div className="mt-4 flex gap-2 justify-end">
          <Button
            variant="danger"
            type="button"
            onClick={() => void rejectIncoming(incoming.callId)}
          >
            {t("calls.decline")}
          </Button>
          <Button
            type="button"
            onClick={() =>
              void acceptIncoming(incoming, meta?.flags.video ? incoming.video : false)
            }
          >
            {t("calls.accept")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
