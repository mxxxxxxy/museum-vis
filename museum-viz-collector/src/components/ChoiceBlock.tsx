import { Check } from "lucide-react";

export function ChoiceBlock({
  title,
  options,
  values,
  required = false,
  invalid = false,
  onToggle,
}: {
  title: string;
  options: string[];
  values: string[];
  required?: boolean;
  invalid?: boolean;
  onToggle: (value: string) => void;
}) {
  return (
    <div className={`choice-block${invalid ? " choice-block-invalid" : ""}`}>
      <div className="block-title">
        <h4>
          {title}
          {required ? <span className="required-badge">必填</span> : null}
        </h4>
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
