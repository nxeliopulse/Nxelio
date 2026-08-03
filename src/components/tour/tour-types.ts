export interface TourStep {
  /** Matches a `data-tour-id` attribute in the DOM. */
  id: string;
  title: string;
  description: string;
  placement?: "top" | "bottom" | "left" | "right";
}
