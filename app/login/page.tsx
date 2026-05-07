"use client";

import { useState } from "react";
import { testSignIn, testSignUp } from "@/lib/test-auth";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    if (mode === "login") {
      const result = await testSignIn(email, password);
      if (result.success) {
        window.location.href = "/";
      } else {
        setError(result.error || "Login failed");
        setLoading(false);
      }
    } else {
      const result = await testSignUp(email, password, fullName);
      if (result.success) {
        window.location.href = "/";
      } else {
        setError(result.error || "Signup failed");
        setLoading(false);
      }
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-ngen-orange/5 flex flex-col items-center justify-center px-4 py-8">
      {/* Animated background accent */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-ngen-orange/10 rounded-full blur-3xl -z-10 opacity-50" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-ngen-navy/5 rounded-full blur-3xl -z-10 opacity-30" />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="flex items-center gap-3 justify-center mb-12">
          <div className="w-11 h-11 bg-gradient-to-br from-ngen-orange to-orange-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md">
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">NGen Connect</h1>
            <p className="text-xs text-gray-500 leading-tight font-medium">Manufacturing Matchmaker</p>
          </div>
        </div>

        {/* Test Mode Banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 mb-4 text-center">
          <p className="text-xs text-amber-700 font-medium">Test Mode - Enter any email/password to sign in</p>
        </div>

        {/* Card */}
        <div className="bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-2xl p-8 shadow-lg overflow-hidden relative">
          {/* Accent bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-ngen-orange to-orange-600" />

          {/* Tab toggle */}
          <div className="flex bg-gray-100 rounded-xl p-1 mb-7">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); setMessage(""); }}
                className={`flex-1 text-sm font-semibold py-2.5 rounded-lg transition-all duration-200 ${
                  mode === m
                    ? "bg-white text-ngen-orange shadow-md border border-ngen-orange/20"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {m === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {mode === "signup" && (
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Smith"
                  required
                  className="w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ngen-orange/20 focus:border-ngen-orange focus:bg-white transition-all"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ngen-orange/20 focus:border-ngen-orange focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ngen-orange/20 focus:border-ngen-orange focus:bg-white transition-all"
              />
            </div>

            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-3">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                </svg>
                <span>{error}</span>
              </div>
            )}
            {message && (
              <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 flex items-start gap-3">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                </svg>
                <span>{message}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-ngen-orange to-orange-600 text-white rounded-lg text-sm font-bold uppercase tracking-wide hover:shadow-lg hover:from-orange-600 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 mt-3"
            >
              {loading
                ? "Please wait..."
                : mode === "login"
                ? "Sign In"
                : "Create Account"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-500 mt-6 font-medium">
          Internal preview — not for external circulation.
        </p>
      </div>
    </div>
  );
}
