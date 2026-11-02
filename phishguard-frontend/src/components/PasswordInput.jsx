import { useState } from "react";
import { FiEye, FiEyeOff } from "react-icons/fi";

/**
 * Password field with a show/hide eye toggle. Drop-in replacement for
 * <input type="password" ...> — accepts the same props.
 */
export default function PasswordInput(props) {
  const [visible, setVisible] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <input
        {...props}
        type={visible ? "text" : "password"}
        style={{ ...(props.style || {}), paddingRight: 40 }}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        title={visible ? "Hide password" : "Show password"}
        style={{
          position: "absolute",
          right: 8,
          top: "50%",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--muted)",
          display: "flex",
          alignItems: "center",
          padding: 4,
        }}
      >
        {visible ? <FiEyeOff size={18} /> : <FiEye size={18} />}
      </button>
    </div>
  );
}
