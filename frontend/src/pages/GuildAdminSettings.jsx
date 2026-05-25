import { useEffect, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Crown, Save, Shield, ExternalLink } from 'lucide-react';
import Layout from '../components/Layout';
import ImageUpload from '../components/ImageUpload';
import { api } from '../lib/api';
import { useAuth } from '../lib/useAuth';
import { useGuild } from '../lib/useGuild';

export default function GuildAdminSettings() {
  const { isAuthed, loading } = useAuth();
  const { current, refresh } = useGuild();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (current?.guild) {
      setForm({
        name: current.guild.name || '',
        tagline: current.guild.tagline || '',
        description: current.guild.description || '',
        logo_url: current.guild.logo_url || '',
        banner_url: current.guild.banner_url || '',
        accent_color: current.guild.accent_color || '',
        is_public: !!current.guild.is_public,
      });
    }
  }, [current?.guild?.id]);

  if (loading) return <Layout><div className="p-10 text-white/40">Cargando…</div></Layout>;
  if (!isAuthed) return <Navigate to="/login" replace />;

  if (!current) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <Shield size={32} className="mx-auto text-white/30 mb-3" />
          <p className="text-white/60">Selecciona un Gremio en el selector superior.</p>
        </div>
      </Layout>
    );
  }

  if (current.role !== 'GUILD_ADMIN') {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <Shield size={32} className="mx-auto text-rose-400/60 mb-3" />
          <p className="text-rose-300">Solo el Maestro del Gremio puede editar estos ajustes.</p>
          <Link to="/guilds" className="inline-block mt-4 text-sm text-elite-violet hover:text-white">← Volver</Link>
        </div>
      </Layout>
    );
  }

  function change(key, value) { setForm((f) => ({ ...f, [key]: value })); }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    const payload = { ...form };
    // Empty strings → null para campos opcionales
    ['tagline', 'description', 'logo_url', 'banner_url', 'accent_color'].forEach((k) => {
      if (payload[k] === '') payload[k] = null;
    });
    try {
      await api.patch(`/guilds/${current.guild.id}/settings`, payload);
      toast.success('Cambios guardados');
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    } finally { setSaving(false); }
  }

  if (!form) return <Layout><div className="p-10 text-white/40">Cargando Gremio…</div></Layout>;

  const accent = form.accent_color || '#8b5cf6';

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex items-center gap-2 text-sm text-white/50 mb-3">
          <Crown size={14} className="text-elite-gold" />
          <span>Maestro del Gremio</span>
        </div>
        <h1 className="font-display text-3xl font-bold mb-1">Ajustes de {current.guild.name}</h1>
        <p className="text-sm text-white/50 mb-6">
          Edita el branding y la visibilidad del Gremio. El código (<span className="font-mono">{current.guild.code}</span>) no se puede cambiar.
        </p>

        <form onSubmit={save} className="space-y-5">
          {/* Identidad */}
          <section className="p-5 rounded-2xl bg-bg-surface border border-bg-border">
            <h2 className="font-display font-semibold mb-4">Identidad</h2>
            <div className="space-y-3">
              <Field label="Nombre" required>
                <input
                  type="text" value={form.name} required minLength={3} maxLength={120}
                  onChange={(e) => change('name', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-bg-border text-sm focus:outline-none focus:border-elite-violet/60"
                />
              </Field>
              <Field label="Tagline" hint="Frase corta que aparece en el directorio (máx 200)">
                <input
                  type="text" value={form.tagline} maxLength={200}
                  onChange={(e) => change('tagline', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-bg-border text-sm focus:outline-none focus:border-elite-violet/60"
                />
              </Field>
              <Field label="Descripción">
                <textarea
                  value={form.description} rows={4}
                  onChange={(e) => change('description', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-bg-border text-sm focus:outline-none focus:border-elite-violet/60 resize-none"
                />
              </Field>
            </div>
          </section>

          {/* Visual */}
          <section className="p-5 rounded-2xl bg-bg-surface border border-bg-border">
            <h2 className="font-display font-semibold mb-4">Branding</h2>
            <div className="space-y-3">
              <Field label="Logo" hint="Cuadrado, ideal 256×256. Se ve en navbar + tarjetas.">
                <ImageUpload
                  value={form.logo_url}
                  onChange={(url) => change('logo_url', url)}
                  category="guild_logos"
                  aspect="square"
                />
              </Field>
              <Field label="Banner" hint="Ancho, ideal 1600×400. Se ve en la landing del Gremio.">
                <ImageUpload
                  value={form.banner_url}
                  onChange={(url) => change('banner_url', url)}
                  category="guild_banners"
                  aspect="wide"
                />
              </Field>
              <Field label="Accent color" hint="HEX, ej. #8b5cf6">
                <div className="flex items-center gap-2">
                  <input
                    type="color" value={form.accent_color || '#8b5cf6'}
                    onChange={(e) => change('accent_color', e.target.value)}
                    className="w-10 h-10 rounded-lg border border-bg-border bg-bg-elevated cursor-pointer"
                  />
                  <input
                    type="text" value={form.accent_color}
                    onChange={(e) => change('accent_color', e.target.value)}
                    placeholder="#8b5cf6"
                    className="flex-grow px-3 py-2 rounded-lg bg-bg-elevated border border-bg-border text-sm focus:outline-none focus:border-elite-violet/60"
                  />
                </div>
              </Field>
            </div>

            {/* Preview */}
            <div className="mt-4 p-4 rounded-xl bg-bg-elevated border border-bg-border">
              <p className="text-[10px] tracking-widest uppercase text-white/40 mb-2">Vista previa</p>
              <div className="flex items-center gap-3" style={{ borderTopColor: accent, borderTopWidth: 3, paddingTop: 12 }}>
                {form.logo_url ? (
                  <img src={form.logo_url} alt="" className="w-12 h-12 rounded-lg object-cover" onError={(e) => { e.target.style.display='none'; }} />
                ) : (
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center"
                       style={{ background: `linear-gradient(135deg, ${accent}, ${accent}aa)` }}>
                    <Shield size={20} className="text-white" />
                  </div>
                )}
                <div>
                  <p className="font-display font-bold">{form.name || 'Tu Gremio'}</p>
                  {form.tagline && <p className="text-xs italic text-white/60">"{form.tagline}"</p>}
                </div>
              </div>
            </div>
          </section>

          {/* Visibilidad */}
          <section className="p-5 rounded-2xl bg-bg-surface border border-bg-border">
            <h2 className="font-display font-semibold mb-4">Visibilidad</h2>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox" checked={form.is_public}
                onChange={(e) => change('is_public', e.target.checked)}
                className="mt-1"
              />
              <div>
                <p className="text-sm font-semibold">Aparece en el directorio público</p>
                <p className="text-xs text-white/50">
                  Si está apagado, el Gremio sigue activo pero no se lista en <Link to="/guilds" className="text-elite-violet hover:underline">/guilds</Link>. Solo se accede directo por el link.
                </p>
              </div>
            </label>
          </section>

          {/* Footer actions */}
          <div className="flex items-center justify-between pt-2">
            <Link
              to={`/guilds/${current.guild.code}`}
              className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white"
              target="_blank" rel="noreferrer"
            >
              <ExternalLink size={12} /> Ver la landing pública
            </Link>
            <button
              type="submit" disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white font-medium hover:shadow-lg transition disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}
            >
              <Save size={14} /> {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>

      </div>
    </Layout>
  );
}

function Field({ label, hint, required, children }) {
  return (
    <div>
      <label className="block text-sm font-semibold mb-1.5">
        {label}{required && <span className="text-rose-400 ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-white/40 mt-1">{hint}</p>}
    </div>
  );
}
