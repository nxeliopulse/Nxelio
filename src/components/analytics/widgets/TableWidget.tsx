import { formatValue } from "./shared/palette";
import { EmptyState } from "./shared/EmptyState";
import type { WidgetProps } from "./shared/types";

/** Generic leaderboard/table widget. Defaults to a plain Label/Value table;
 *  pass `config.tableColumns` to show extra columns pulled from each row's
 *  `meta` object (reserved keys "label"/"value" pull from the row directly —
 *  this is what lets legacy row-level panels like "Top Open Opportunities"
 *  or "Recent Prospect Streams" reuse this one component instead of each
 *  needing a bespoke table). */
export function TableWidget({ config, data }: WidgetProps) {
  if (!data.length) return <EmptyState />;
  const columns = config.tableColumns ?? [
    { key: "label", label: "Name" },
    { key: "value", label: "Value" },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50/50 dark:bg-slate-900/40 text-left border-b border-slate-100 dark:border-slate-800">
            {columns.map((c) => (
              <th key={c.key} className="py-2 px-3 font-bold text-slate-500 dark:text-slate-500">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
          {data.slice(0, 20).map((row, i) => (
            <tr key={i} className="text-slate-700 dark:text-slate-600">
              {columns.map((c, ci) => (
                <td key={c.key} className="py-2 px-3">
                  {c.key === "label"
                    ? config.showRank && ci === 0
                      ? `${i + 1}. ${row.label}`
                      : row.label
                    : c.key === "value"
                      ? formatValue(row.value, config.unit)
                      : String(row.meta?.[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
