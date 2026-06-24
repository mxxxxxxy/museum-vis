export function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const invalid = Boolean(required) && value.trim().length === 0;
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
