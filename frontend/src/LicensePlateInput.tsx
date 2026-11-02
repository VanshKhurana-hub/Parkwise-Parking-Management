import { CheckCircle2, AlertCircle, CarFront } from "lucide-react";
import { useId, useMemo, type ChangeEvent } from "react";

// Standard Indian format: MH-12-AB-1234 or DL 01 C 9999 or KA05MJ4321
// Standard International format: NYC-4589 or ABC-1234 or 7XYZ999
export const PLATE_REGEX = /^(?:[A-Z]{2}[- ]?[0-9]{1,2}[- ]?[A-Z]{1,3}[- ]?[0-9]{4}|[A-Z0-9]{2,4}[- ]?[A-Z0-9]{2,5}(?:[- ]?[A-Z0-9]{1,4})?)$/i;

interface LicensePlateInputProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  label?: string;
  placeholder?: string;
}

export function LicensePlateInput({
  value,
  onChange,
  required = true,
  disabled = false,
  id: customId,
  label = "License Plate Registration",
  placeholder = "e.g. DL-01-AB-1234 or MH 12 CD 5678",
}: LicensePlateInputProps) {
  const generatedId = useId();
  const inputId = customId || generatedId;

  const isValid = useMemo(() => {
    if (!value.trim()) return false;
    return PLATE_REGEX.test(value.trim());
  }, [value]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.toUpperCase();
    onChange(raw);
  }

  return (
    <div className="license-plate-field">
      <div className="field-label-row">
        <label htmlFor={inputId} className="input-label">
          {label} {required && <span className="required-star" aria-hidden="true">*</span>}
        </label>
        {value.trim().length > 0 && (
          <span className={`plate-status-chip ${isValid ? "valid" : "invalid"}`} aria-live="polite">
            {isValid ? (
              <>
                <CheckCircle2 size={13} aria-hidden="true" />
                <span>Valid Format</span>
              </>
            ) : (
              <>
                <AlertCircle size={13} aria-hidden="true" />
                <span>Invalid Format</span>
              </>
            )}
          </span>
        )}
      </div>

      <div className="plate-input-wrapper">
        <span className="plate-country-badge" aria-hidden="true">
          <CarFront size={16} />
          <span>IND</span>
        </span>
        <input
          id={inputId}
          name="license_plate"
          type="text"
          required={required}
          disabled={disabled}
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          className={`plate-input ${value && !isValid ? "input-invalid" : ""}`}
          maxLength={15}
        />
      </div>

      <p className="field-hint">
        Standard formats: <code>DL-01-AB-1234</code>, <code>MH 12 CD 5678</code>, or international alphanumeric.
      </p>
    </div>
  );
}

