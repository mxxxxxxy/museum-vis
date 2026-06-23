import { Check } from "lucide-react";

export function ChoiceBlock({
  title,
  options,
  values,
  onToggle,
}: {
  title: string;
  options: string[];
  values: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="choice-block">
      <div className="block-title">
        <h4>{title}</h4>
      </div>
      <div className="chip-grid">
        {options.map((option) => (
          <button
            type="button"
            key={option}
            className={values.includes(option) ? "chip selected" : "chip"}
            onClick={() => onToggle(option)}
          >
            {values.includes(option) ? <Check size={15} /> : null}
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
