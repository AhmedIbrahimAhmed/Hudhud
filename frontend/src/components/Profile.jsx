import { useRef, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import ContributionGrid from './ContributionGrid.jsx';

export default function Profile() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.display_name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  async function saveInfo(e) {
    e.preventDefault();
    setMsg('');
    setError('');
    try {
      const r = await api.put('/profile', { display_name: name, bio });
      setUser(r.data.user);
      setMsg('تم حفظ التغييرات.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function uploadAvatar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const form = new FormData();
    form.append('avatar', file);
    try {
      const r = await api.post('/profile/avatar', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUser(r.data.user);
      setMsg('تم تحديث الصورة.');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="max-w-xl mx-auto p-6">
      <h2 className="text-xl font-bold mb-6 text-gray-800">الملف الشخصي</h2>

      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-20 h-20 rounded-full bg-brand-light grid place-items-center overflow-hidden">
            {user?.avatar_path ? (
              <img src={user.avatar_path} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-brand text-2xl">{(name || '؟')[0]}</span>
            )}
          </div>
          <div>
            <button
              onClick={() => fileRef.current?.click()}
              className="text-sm text-brand border border-brand rounded-lg px-3 py-1.5 hover:bg-brand-light"
            >
              تغيير الصورة
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={uploadAvatar}
              className="hidden"
            />
            <p className="text-xs text-gray-400 mt-1">حد أقصى 4 ميغابايت</p>
          </div>
        </div>

        <form onSubmit={saveInfo} className="space-y-4">
          <label className="block">
            <span className="text-xs text-gray-600">الاسم</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-600">نبذة</span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-600">البريد الإلكتروني</span>
            <input
              value={user?.email || ''}
              disabled
              className="w-full mt-1 border border-gray-100 bg-gray-50 rounded-xl px-3 py-2 text-sm text-gray-400"
            />
          </label>

          {msg && <p className="text-brand text-xs">{msg}</p>}
          {error && <p className="text-flag-red text-xs">{error}</p>}

          <button className="bg-brand text-white px-5 py-2 rounded-xl text-sm hover:bg-brand-dark">
            حفظ
          </button>
        </form>
      </div>

      <ContributionGrid />
    </div>
  );
}
