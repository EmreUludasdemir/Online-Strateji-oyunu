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
        ✉
      </IconButton>
      <IconButton type="button" aria-label={copy.hud.openStore} onClick={onStore}>
        ₴
      </IconButton>
      <IconButton type="button" aria-label={copy.hud.openCommander} onClick={onCommander}>
        ⚔
      </IconButton>
    </>
  );
}
