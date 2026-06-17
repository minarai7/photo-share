type FormFieldProps = {
    id: string;
    label: string;
    type: "text" | "email" | "password";
    value: string
    setValue: (value: string) => void;
    autoComplete?: string;
}

export function FormField({
    id,
    label,
    type,
    value,
    setValue,
    autoComplete,
}: FormFieldProps) {
    return (
        <div className="form-field">
            <label htmlFor={id}>{label}</label>
            <input
                id={id}
                name={id}
                type={type}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                autoComplete={autoComplete}
            />
        </div>
    )
}