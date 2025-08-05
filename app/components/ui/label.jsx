export function Label({ children, htmlFor, className = "" }) {
  return (
    <label htmlFor={htmlFor} className={`block font-medium ${className}`}>
      {children}
    </label>
  );
}
