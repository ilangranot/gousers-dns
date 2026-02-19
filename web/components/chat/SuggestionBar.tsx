"use client";

interface Props {
  suggestions: string[];
  onSelect: (s: string) => void;
}

export default function SuggestionBar({ suggestions, onSelect }: Props) {
  if (!suggestions.length) return null;
  return (
    <div
      className="flex gap-2 flex-wrap px-4 py-2 border-t"
      style={{ borderColor: "rgb(var(--border))" }}
    >
      {suggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => onSelect(s)}
          className="text-xs rounded-full px-3 py-1.5 border transition-all hover:opacity-80"
          style={{
            background: "rgb(var(--bg-elevated))",
            borderColor: "rgb(var(--border))",
            color: "rgb(var(--text-muted))",
          }}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
