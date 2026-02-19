export interface Theme {
  id: string;
  label: string;
  description: string;
  preview: string[]; // 3 representative colors for the picker swatch
}

export const THEMES: Theme[] = [
  {
    id: "midnight",
    label: "Midnight",
    description: "Deep blue-indigo dark",
    preview: ["#0f172a", "#6366f1", "#8b5cf6"],
  },
  {
    id: "ocean",
    label: "Ocean",
    description: "Teal & sky blue dark",
    preview: ["#02193a", "#0ea5e9", "#06b6d4"],
  },
  {
    id: "forest",
    label: "Forest",
    description: "Deep green dark",
    preview: ["#05140a", "#22c55e", "#10b981"],
  },
  {
    id: "sunset",
    label: "Sunset",
    description: "Warm orange & red dark",
    preview: ["#1c0a05", "#f97316", "#ef4444"],
  },
  {
    id: "light",
    label: "Light",
    description: "Clean light mode",
    preview: ["#f8fafc", "#6366f1", "#8b5cf6"],
  },
];
