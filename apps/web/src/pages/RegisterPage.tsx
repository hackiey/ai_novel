import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext.js";
import { trpc } from "../lib/trpc.js";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const settingsQuery = trpc.settings.get.useQuery();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(email, password, displayName);
      navigate({ to: "/" });
    } catch (err: any) {
      setError(err.message || t("register.failed"));
    } finally {
      setLoading(false);
    }
  }

  if (settingsQuery.data?.registrationEnabled === false) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="w-full max-w-sm mx-auto p-6 glass-panel rounded-2xl text-center">
          <h1 className="text-2xl font-bold mb-4 text-white/90">{t("register.title")}</h1>
          <p className="text-sm text-white/50 mb-4">{t("register.disabled")}</p>
          <Link to="/login" className="text-teal-400 hover:underline text-sm">
            {t("register.login")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-sm mx-auto p-6 glass-panel rounded-2xl">
        <h1 className="text-2xl font-bold text-center mb-6 text-white/90">{t("register.title")}</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">{t("register.displayName")}</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">{t("register.email")}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">{t("register.password")}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-lg bg-white/10 border border-white/15 text-white/80 text-sm font-medium hover:bg-white/20 disabled:opacity-50 transition-colors"
          >
            {loading ? t("register.loading") : t("register.submit")}
          </button>
        </form>
        <p className="text-center text-sm text-white/50 mt-4">
          {t("register.hasAccount")}{" "}
          <Link to="/login" className="text-teal-400 hover:underline">
            {t("register.login")}
          </Link>
        </p>
      </div>
    </div>
  );
}
