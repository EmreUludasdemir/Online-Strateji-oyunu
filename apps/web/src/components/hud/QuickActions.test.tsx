import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { copy } from "../../lib/i18n";
import { QuickActions } from "./QuickActions";

describe("QuickActions", () => {
  it("omits the store action when release flags disable it", () => {
    const html = renderToStaticMarkup(
      <QuickActions onInbox={() => undefined} onCommander={() => undefined} showStore={false} />,
    );

    expect(html).toContain(copy.hud.openInbox);
    expect(html).toContain(copy.hud.openCommander);
    expect(html).not.toContain(copy.hud.openStore);
    expect(html).not.toContain("data-quick-action=\"sound\"");
  });

  it("renders a persisted sound toggle state when provided", () => {
    const html = renderToStaticMarkup(
      <QuickActions
        onInbox={() => undefined}
        onCommander={() => undefined}
        onToggleSound={() => undefined}
        showStore={false}
        soundMuted
      />,
    );

    expect(html).toContain("Sesi Aç");
    expect(html).toContain("data-quick-action=\"sound\"");
    expect(html).toContain("data-audio-muted=\"true\"");
  });
});
