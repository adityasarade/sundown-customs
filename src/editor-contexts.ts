/**
 * Four branded contexts for the same native Unlayer React Image Editor.
 * Each one picks its own tool set, labels (via Unlayer translations), tool
 * icons and theme, so the editor reads as a diegetic in-world device.
 */
export type EditorKind = "wrap" | "respray" | "photo" | "emblem";

type Tool =
  | "crop"
  | "resize"
  | "filter"
  | "draw"
  | "text"
  | "shapes"
  | "stickers"
  | "frame"
  | "corners";

const icon = (name: string) =>
  typeof location === "undefined" ? undefined : `${location.origin}/icons/${name}.svg`;

type Context = {
  theme: "light" | "dark";
  tools: Partial<Record<Tool, boolean | { enabled: boolean; icon?: string }>>;
  labels: Record<string, string>;
};

const off = { resize: false, frame: false, corners: false, crop: false };

export const CONTEXTS: Record<EditorKind, Context> = {
  wrap: {
    theme: "light",
    tools: {
      ...off,
      draw: { enabled: true, icon: icon("spray") },
      text: { enabled: true, icon: icon("tag") },
      shapes: { enabled: true, icon: icon("stencil") },
      stickers: { enabled: true, icon: icon("decal") },
      filter: { enabled: true, icon: icon("tint") },
      crop: { enabled: true, icon: icon("trim") },
    },
    labels: {
      "image_editor.tools.draw": "Spray can",
      "image_editor.tools.text": "Tag",
      "image_editor.tools.shapes": "Stencils",
      "image_editor.tools.stickers": "Decals",
      "image_editor.tools.filter": "Tint",
      "image_editor.tools.crop": "Trim",
      "image_editor.toolbar.save": "Fit the wrap",
      "image_editor.toolbar.cancel": "Bail",
      "image_editor.labels.drawing": "Spray",
      "image_editor.labels.text": "Tag",
      "image_editor.labels.sticker": "Decal",
      "image_editor.labels.shape": "Stencil",
    },
  },
  respray: {
    theme: "dark",
    tools: {
      ...off,
      filter: { enabled: true, icon: icon("tint") },
      draw: { enabled: true, icon: icon("spray") },
      shapes: { enabled: true, icon: icon("stencil") },
      stickers: { enabled: true, icon: icon("decal") },
      text: { enabled: true, icon: icon("tag") },
    },
    labels: {
      "image_editor.tools.filter": "Instant respray",
      "image_editor.tools.draw": "Spray can",
      "image_editor.tools.shapes": "Cover-up",
      "image_editor.tools.stickers": "Fake decals",
      "image_editor.tools.text": "New tag",
      "image_editor.toolbar.save": "Respray & go",
      "image_editor.toolbar.cancel": "Drive off",
      "image_editor.labels.drawing": "Overspray",
      "image_editor.labels.shape": "Cover-up",
    },
  },
  emblem: {
    theme: "dark",
    tools: {
      ...off,
      stickers: { enabled: true, icon: icon("decal") },
      shapes: { enabled: true, icon: icon("stencil") },
      text: { enabled: true, icon: icon("tag") },
      draw: { enabled: true, icon: icon("spray") },
      filter: { enabled: true, icon: icon("tint") },
    },
    labels: {
      "image_editor.tools.stickers": "Symbols",
      "image_editor.tools.shapes": "Badge shapes",
      "image_editor.tools.text": "Crew name",
      "image_editor.tools.draw": "Freehand",
      "image_editor.tools.filter": "Colourway",
      "image_editor.toolbar.save": "Rep the crew",
      "image_editor.toolbar.cancel": "Back",
    },
  },
  photo: {
    theme: "dark",
    tools: {
      crop: { enabled: true, icon: icon("trim") },
      filter: { enabled: true, icon: icon("tint") },
      frame: { enabled: true, icon: icon("frame") },
      text: { enabled: true, icon: icon("caption") },
      stickers: { enabled: true, icon: icon("decal") },
      draw: { enabled: true, icon: icon("spray") },
      shapes: false,
      resize: false,
      corners: false,
    },
    labels: {
      "image_editor.tools.crop": "Frame up",
      "image_editor.tools.filter": "Snappix filters",
      "image_editor.tools.frame": "Borders",
      "image_editor.tools.text": "Caption",
      "image_editor.tools.stickers": "Stickers",
      "image_editor.tools.draw": "Doodle",
      "image_editor.toolbar.save": "Post to BAYFEED",
      "image_editor.toolbar.cancel": "Discard",
    },
  },
};

export function editorOptions(kind: EditorKind) {
  const c = CONTEXTS[kind];
  return {
    theme: c.theme,
    locale: "en",
    translations: { en: c.labels },
    aiAssistantOpenState: "closed" as const,
    features: { imageEditor: { tools: c.tools } },
  };
}

export function actionNames(kind: EditorKind) {
  const l = CONTEXTS[kind].labels;
  return [l["image_editor.toolbar.save"], l["image_editor.toolbar.cancel"]].filter(Boolean);
}
