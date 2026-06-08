import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { AuthShell, Field } from './Login.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await register(email, password, name);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="إنشاء حساب جديد">
      <form onSubmit={submit} className="space-y-4">
        <Field label="الاسم" value={name} onChange={setName} />
        <Field label="البريد الإلكتروني" type="email" value={email} onChange={setEmail} />
        <Field label="كلمة المرور (6 أحرف فأكثر)" type="password" value={password} onChange={setPassword} />
        {error && <p className="text-flag-red text-xs">{error}</p>}
        <button
          disabled={busy}
          className="w-full bg-brand text-white py-2.5 rounded-xl hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? 'جارٍ الإنشاء…' : 'إنشاء الحساب'}
        </button>
      </form>
      <p className="text-xs text-gray-500 text-center mt-4">
        لديك حساب؟{' '}
        <Link to="/login" className="text-brand font-medium">
          سجّل الدخول
        </Link>
      </p>
    </AuthShell>
  );
}
