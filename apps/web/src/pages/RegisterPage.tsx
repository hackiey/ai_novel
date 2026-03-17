import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext.js";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
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

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-sm mx-auto p-6">
        <h1 className="text-2xl font-bold text-center mb-6">{t("register.title")}</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("register.displayName")}</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("register.email")}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("register.password")}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-500 disabled:opacity-50 transition-colors"
          >
            {loading ? t("register.loading") : t("register.submit")}
          </button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-4">
          {t("register.hasAccount")}{" "}
          <Link to="/login" className="text-teal-600 hover:underline">
            {t("register.login")}
          </Link>
        </p>
      </div>
    </div>
  );
}
