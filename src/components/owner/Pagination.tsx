import Link from "next/link";
import { Icon } from "@/components/Icon";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  // Query params to preserve across page changes (e.g. filter, q, sort, dir).
  params: Record<string, string | undefined>;
};

// Builds an href for the given page, carrying over the active filters/sort.
function hrefFor(basePath: string, params: Props["params"], page: number): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  if (page > 1) sp.set("page", String(page));
  else sp.delete("page");
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

// A windowed range of page numbers around the current page (with first/last anchors).
function pageWindow(page: number, totalPages: number): (number | "…")[] {
  const span = 1; // pages shown on each side of the current page
  const out: (number | "…")[] = [];
  let last = 0;
  for (let i = 1; i <= totalPages; i++) {
    const edge = i === 1 || i === totalPages;
    const near = i >= page - span && i <= page + span;
    if (!edge && !near) continue;
    if (last && i - last > 1) out.push("…");
    out.push(i);
    last = i;
  }
  return out;
}

export function Pagination({ page, pageSize, total, basePath, params }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * pageSize + 1;
  const end = Math.min(current * pageSize, total);

  const disabledStyle: React.CSSProperties = { opacity: 0.4, pointerEvents: "none" };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 16px",
        borderTop: "1px solid var(--line)",
        flexWrap: "wrap",
      }}
    >
      <div className="text-xs text-muted">
        Showing <strong>{start.toLocaleString("en-IN")}</strong>–
        <strong>{end.toLocaleString("en-IN")}</strong> of{" "}
        <strong>{total.toLocaleString("en-IN")}</strong>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Link
          className="btn btn-sm"
          href={hrefFor(basePath, params, current - 1)}
          style={current <= 1 ? disabledStyle : undefined}
          aria-disabled={current <= 1}
          aria-label="Previous page"
        >
          <Icon name="chevron-left" className="icon-sm" /> Prev
        </Link>
        {pageWindow(current, totalPages).map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`} className="text-xs text-muted" style={{ padding: "0 2px" }}>
              …
            </span>
          ) : (
            <Link
              key={p}
              className={"btn btn-sm" + (p === current ? " btn-primary" : "")}
              href={hrefFor(basePath, params, p)}
              aria-current={p === current ? "page" : undefined}
            >
              {p}
            </Link>
          ),
        )}
        <Link
          className="btn btn-sm"
          href={hrefFor(basePath, params, current + 1)}
          style={current >= totalPages ? disabledStyle : undefined}
          aria-disabled={current >= totalPages}
          aria-label="Next page"
        >
          Next <Icon name="chevron-right" className="icon-sm" />
        </Link>
      </div>
    </div>
  );
}
