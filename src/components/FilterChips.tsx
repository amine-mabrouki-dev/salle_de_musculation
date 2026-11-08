import { useEffect, useRef } from "react";

export type SectionFilter = string;

interface FilterChipsProps {
  sections: string[];
  value: SectionFilter;
  onChange: (value: SectionFilter) => void;
}

export function FilterChips({ sections, value, onChange }: FilterChipsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedRef = useRef<HTMLButtonElement | null>(null);
  const filters: SectionFilter[] = ["Tous", ...sections];

  useEffect(() => {
    const container = containerRef.current;
    const selectedButton = selectedRef.current;
    if (!container || !selectedButton) return;

    const bounds = selectedButton.getBoundingClientRect();
    const containerBounds = container.getBoundingClientRect();
    const offset = bounds.left - containerBounds.left;
    const delta = offset < 0
      ? offset - 8
      : offset + selectedButton.offsetWidth > containerBounds.width
        ? offset + selectedButton.offsetWidth - containerBounds.width + 8
        : 0;

    if (delta !== 0) {
      container.scrollBy({ left: delta, behavior: "smooth" });
    }
  }, [value]);

  return (
    <div className="filter-chips" ref={containerRef} role="group" aria-label="Filtrer par section">
      {filters.map((filter) => (
        <button
          ref={value === filter ? selectedRef : null}
          className="filter-chip"
          key={filter}
          type="button"
          aria-pressed={value === filter}
          onClick={() => onChange(filter)}
        >
          {filter}
        </button>
      ))}
    </div>
  );
}
