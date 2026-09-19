'use client';

export interface ToggleChipOption {
  value: string;
  label: string;
}

interface ToggleChipsProps {
  options: ToggleChipOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

// A short, fixed option list (classifications: 8 items) doesn't need a
// dropdown multi-select — toggle chips are simpler, fully keyboard/tap
// accessible, and show the whole selection state at a glance.
export function ToggleChips({ options, selected, onChange }: ToggleChipsProps) {
  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            aria-pressed={active}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              active
                ? 'border-emerald-600 bg-emerald-600 text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:border-emerald-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
