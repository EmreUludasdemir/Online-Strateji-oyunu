import { copy } from "../../lib/i18n";
import { IconButton } from "../ui/IconButton";

export function QuickActions({
  onInbox,
  onStore,
  onCommander,
}: {
  onInbox: () => void;
  onStore: () => void;
  onCommander: () => void;
}) {
  return (
    <>
      <IconButton type="button" aria-label={copy.hud.openInbox} onClick={onInbox}>
        UL
      </IconButton>
      <IconButton type="button" aria-label={copy.hud.openStore} onClick={onStore}>
        KV
      </IconButton>
      <IconButton type="button" aria-label={copy.hud.openCommander} onClick={onCommander}>
        KM
      </IconButton>
    </>
  );
}
