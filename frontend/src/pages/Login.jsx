import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="تسجيل الدخول">
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="البريد الإلكتروني"
          type="email"
          value={email}
          onChange={setEmail}
        />
        <Field
          label="كلمة المرور"
          type="password"
          value={password}
          onChange={setPassword}
        />
        {error && <p className="text-flag-red text-xs">{error}</p>}
        <button
          disabled={busy}
          className="w-full bg-brand text-white py-2.5 rounded-xl hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? "جارٍ الدخول…" : "دخول"}
        </button>
      </form>
      <p className="text-xs text-gray-500 text-center mt-4">
        ليس لديك حساب؟{" "}
        <Link to="/register" className="text-brand font-medium">
          أنشئ حساباً
        </Link>
      </p>
    </AuthShell>
  );
}

export function AuthShell({ title, children }) {
  return (
    <div className="h-full grid place-items-center bg-gradient-to-b from-brand-light to-gray-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-7">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-brand">هدهد</h1>
          <p className="text-sm text-gray-500 mt-1">{title}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, type = "text", value, onChange }) {
  return (
    <label className="block">
      <span className="text-xs text-gray-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
      />
    </label>
  );
}
