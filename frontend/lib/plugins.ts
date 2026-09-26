export type PluginId = "canva" | "github";

export interface CanvasPluginPanel {
  id: string;
  plugin: PluginId;
}