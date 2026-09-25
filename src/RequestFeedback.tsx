import { t, useTranslation } from "./i18n";
import {
  slowRequestMessage,
  useOnline,
  useSlowRequest,
} from "./requestFeedback";

export function RequestProgress({
  pending,
  label,
}: {
  pending: boolean;
  label: string;
}) {
  useTranslation();
  const slow = useSlowRequest(pending);
  return pending ? (
    <p className="request-progress" role="status">
      {t(slow ? slowRequestMessage : label)}
    </p>
  ) : null;
}

export function RetryDelay({ seconds }: { seconds: number }) {
  useTranslation();
  return seconds > 0 ? (
    <p className="muted" aria-live="polite">
      {t("You can try again in {seconds} seconds.", { seconds })}
    </p>
  ) : null;
}

export function NetworkNotice() {
  useTranslation();
  const online = useOnline();
  return online ? null : (
    <aside className="network-notice" aria-live="polite">
      {t(
        "You are offline. Local Git remains available. Reconnect to use your team.",
      )}
    </aside>
  );
}
