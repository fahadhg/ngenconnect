"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  plan: string;
  created_at: string;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (data) {
        setProfile(data as Profile);
        setFullName(data.full_name || "");
      }
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);

    await supabase
      .from("profiles")
      .update({ full_name: fullName })
      .eq("id", profile.id);

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-2 h-2 rounded-full bg-gray-300 animate-bounce"
              style={{ animationDelay: `${i * 0.12}s`, animationDuration: "0.8s" }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Profile Settings</h1>
          <p className="text-base text-gray-600 mt-2">Manage your account details and preferences</p>
        </div>

        {/* Avatar & Info Card */}
        <div className="bg-white border border-gray-200 rounded-xl p-7 mb-6 shadow-sm">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-ngen-orange to-orange-600 flex items-center justify-center flex-shrink-0 shadow-md">
              <span className="text-2xl font-bold text-white uppercase">
                {fullName?.[0] || profile?.email?.[0] || "?"}
              </span>
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">{fullName || "No name set"}</p>
              <p className="text-sm text-gray-600 mt-1">{profile?.email}</p>
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-ngen-orange/10 text-ngen-orange uppercase tracking-wider capitalize">
                  {profile?.role}
                </span>
                <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-gray-200/50 text-gray-700 uppercase tracking-wider capitalize">
                  {profile?.plan} plan
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Edit Form */}
        <div className="bg-white border border-gray-200 rounded-xl p-7 shadow-sm">
          <h2 className="text-base font-bold text-gray-900 mb-6">Update Profile</h2>
          <form onSubmit={handleSave} className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2.5">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                className="w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ngen-orange/20 focus:border-ngen-orange focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2.5">Email Address</label>
              <input
                type="email"
                value={profile?.email || ""}
                disabled
                className="w-full px-4 py-3 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-500 cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-2 font-medium">Email address cannot be changed here.</p>
            </div>

            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2.5">Role</label>
                <input
                  value={profile?.role || ""}
                  disabled
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-500 cursor-not-allowed capitalize"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2.5">Plan</label>
                <input
                  value={profile?.plan || ""}
                  disabled
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-500 cursor-not-allowed capitalize"
                />
              </div>
            </div>

            <div className="pt-4 flex items-center gap-4 border-t border-gray-100">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-3 bg-gradient-to-r from-ngen-orange to-orange-600 text-white rounded-lg text-sm font-bold uppercase tracking-wide hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
              {saved && (
                <span className="text-sm text-emerald-600 font-semibold flex items-center gap-2">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  </svg>
                  Saved!
                </span>
              )}
            </div>
          </form>
        </div>

        {/* Account info footer */}
        {profile?.created_at && (
          <p className="text-xs text-gray-500 text-center mt-6 font-medium">
            Member since {new Date(profile.created_at).toLocaleDateString("en-CA", { month: "long", year: "numeric" })}
          </p>
        )}
      </div>
    </div>
  );
}
