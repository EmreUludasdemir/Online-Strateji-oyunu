import { Badge } from "./Badge";
import { SectionCard } from "./SectionCard";

type PageNoticeTone = "info" | "warning" | "danger";

interface PageNoticeProps {
  title: string;
  body: string;
  kicker?: string;
  tone?: PageNoticeTone;
}

export function PageNotice({
  title,
  body,
  kicker = "Command status",
  tone = "info",
}: PageNoticeProps) {
  return (
    <SectionCard kicker={kicker} title={title} aside={<Badge tone={tone}>{tone}</Badge>}>
      <p style={{ margin: 0, color: "var(--color-on-surface-variant)", lineHeight: 1.65 }}>{body}</p>
    </SectionCard>
  );
}
