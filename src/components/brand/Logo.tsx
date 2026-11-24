/**
 * SNCK brand mark.
 *
 * The path below is the original SNCK logo geometry from the panel's existing
 * artwork. It is intentionally kept byte-for-byte so the identity never changes
 * across light/dark treatments: only the surrounding surface and ink colour do.
 */

const SNCK_LOGO_PATH =
  "M49 94 37 68 9 48 Q3 43 8 38 Q11 35 17 38 L37 48 22 20 Q18 13 23 10 Q28 7 33 13 L49 36 61 20 67 37 82 10 Q87 4 92 9 Q96 13 91 20 L79 39 91 35 Q98 33 100 40 Q101 46 93 49 L72 54 51 94 Q50 97 49 94 Z M50 49 40 61 50 73 60 60 Z";

export function SnckMark({ className = "", title = "SNCK" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label={`${title} logo`} className={className} fill="currentColor">
      <path d={SNCK_LOGO_PATH} fillRule="evenodd" />
    </svg>
  );
}

export function Brand({
  name,
  compact = false,
  onDark = true,
}: {
  name: string;
  compact?: boolean;
  onDark?: boolean;
}) {
  return (
    <div className="pn-brand">
      <div className="pn-brand-mark" style={onDark ? undefined : { background: "#ffffff", borderColor: "#e4e4e7", color: "#050505" }}>
        <SnckMark />
      </div>
      {!compact ? (
        <div className="pn-brand-copy">
          <div className="pn-brand-name">{name}</div>
          <div className="pn-brand-tag">Control Panel</div>
        </div>
      ) : null}
    </div>
  );
}
