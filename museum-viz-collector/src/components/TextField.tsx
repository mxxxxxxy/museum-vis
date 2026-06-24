export function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  invalid = false,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  return (
    <label
      className={`field${invalid ? " field-invalid" : ""}${className ? ` ${className}` : ""}`}
    >
      <span>
        {label}
        {required ? <b>必填</b> : null}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
