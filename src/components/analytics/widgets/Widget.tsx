import { WidgetSkeleton, WidgetError, EmptyState } from "./shared/EmptyState";
import { KpiTile } from "./KpiTile";
import { BarChartWidget } from "./BarChartWidget";
import { LineChartWidget } from "./LineChartWidget";
import { AreaChartWidget } from "./AreaChartWidget";
import { DonutChartWidget } from "./DonutChartWidget";
import { TableWidget } from "./TableWidget";
import { FunnelWidget } from "./FunnelWidget";
import { GaugeWidget } from "./GaugeWidget";
import { TargetBarWidget } from "./TargetBarWidget";
import { ZoneWidget } from "./ZoneWidget";
import { StageWidget } from "./StageWidget";
import { WaterfallWidget } from "./WaterfallWidget";
import { AnomalyWidget } from "./AnomalyWidget";
import type { WidgetProps } from "./shared/types";

/** Dispatches to the right chart component by chart type. Owns only
 *  loading/error/empty states — each leaf component owns its own rendering. */
export function Widget(props: WidgetProps) {
  const { config, data, loading, error } = props;
  if (loading) return <WidgetSkeleton />;
  if (error) return <WidgetError message={error} />;
  if (!data.length) return <EmptyState />;

  switch (config.chartType) {
    case "kpi":
      return <KpiTile {...props} />;
    case "gauge":
      return <GaugeWidget {...props} />;
    case "target":
      return <TargetBarWidget {...props} />;
    case "bar":
    case "column":
      return <BarChartWidget {...props} />;
    case "line":
      return <LineChartWidget {...props} />;
    case "area":
      return <AreaChartWidget {...props} />;
    case "donut":
      return <DonutChartWidget {...props} />;
    case "table":
      return <TableWidget {...props} />;
    case "funnel":
      return <FunnelWidget {...props} />;
    case "zone":
      return <ZoneWidget {...props} />;
    case "stage":
      return <StageWidget {...props} />;
    case "waterfall":
      return <WaterfallWidget {...props} />;
    case "anomaly":
      return <AnomalyWidget {...props} />;
    default:
      // heatmap/radar/scatter — system-only, bespoke shapes rendered by
      // SystemWidget directly rather than through this generic dispatcher.
      // comparator/quadrant/cohort have their own result shapes and are
      // rendered by AnyChartRenderer, never reaching this dispatcher.
      return <EmptyState message={`Chart type "${config.chartType}" isn't rendered through the generic widget yet.`} />;
  }
}
