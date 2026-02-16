import React from "react";
import { Form } from "react-bootstrap";

const ShiftEnterTextWidget = ({
  id,
  value,
  required,
  disabled,
  readonly,
  autofocus,
  placeholder,
  onChange,
  onBlur,
  onFocus,
}) => {
  const handleKeyDown = (event) => {
    if (event.key !== "Enter") {
      return;
    }

    if (!event.shiftKey) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    const input = event.currentTarget;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    const inputValue = value || "";
    const nextValue = `${inputValue.slice(0, start)}\n${inputValue.slice(end)}`;

    onChange(nextValue);

    requestAnimationFrame(() => {
      input.selectionStart = start + 1;
      input.selectionEnd = start + 1;
    });
  };

  return (
    <Form.Control
      as="textarea"
      id={id}
      value={value || ""}
      required={required}
      disabled={disabled || readonly}
      autoFocus={autofocus}
      placeholder={placeholder}
      rows={1}
      onKeyDown={handleKeyDown}
      onChange={(event) => onChange(event.target.value)}
      onBlur={(event) => onBlur(id, event.target.value)}
      onFocus={(event) => onFocus(id, event.target.value)}
    />
  );
};

export default ShiftEnterTextWidget;
