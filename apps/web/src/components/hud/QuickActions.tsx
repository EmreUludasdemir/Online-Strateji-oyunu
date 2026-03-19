import { copy } from "../../lib/i18n";
import { IconButton } from "../ui/IconButton";

function InboxIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M4 7.5h16v9.5h-4.4l-1.6 2h-4l-1.6-2H4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M4.5 8l7.5 6 7.5-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function StoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M6.5 9.5h11l-1 9h-9z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M9 9.5V8a3 3 0 0 1 6 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M9.2 13h5.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CommanderIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M7 4.5h7.5l2.5 2.5v12l-4.2-2.3-3.8 2.3V4.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="1.6" fill="currentColor" />
    </svg>
  );
}

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
        <InboxIcon />
      </IconButton>
      <IconButton type="button" aria-label={copy.hud.openStore} onClick={onStore}>
        <StoreIcon />
      </IconButton>
      <IconButton type="button" aria-label={copy.hud.openCommander} onClick={onCommander}>
        <CommanderIcon />
      </IconButton>
    </>
  );
}
