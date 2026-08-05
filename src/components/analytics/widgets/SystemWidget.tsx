import { HeatmapSystem } from "./system/Heatmap";
import { RadarSystem } from "./system/RadarSystem";
import { ScatterSystem } from "./system/ScatterSystem";
import { ThresholdAlerts } from "./system/ThresholdAlerts";
import { Widget } from "./Widget";
import type { SystemWidgetData } from "@/lib/analytics-system-widgets";
import type { ChartType } from "@/lib/analytics-reports";

export function SystemWidget({
  data,
  title,
  chartType,
  unit,
}: {
  data: SystemWidgetData;
  title: string;
  chartType: ChartType;
  unit?: "number" | "currency" | "percent";
}) {
  switch (data.kind) {
    case "heatmap":
      return <HeatmapSystem grid={data.grid} />;
    case "radar":
      return <RadarSystem points={data.points} />;
    case "scatter":
      return <ScatterSystem points={data.points} />;
    case "alerts":
      return <ThresholdAlerts items={data.items} />;
    case "generic":
      return <Widget config={{ chartType, title, unit, tableColumns: data.tableColumns }} data={data.rows} />;
  }
}
