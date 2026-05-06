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
      <div className="max-w-xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">Profile Settings</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage your account details</p>
        </div>

        {/* Avatar */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-ngen-red/10 flex items-center justify-center flex-shrink-0">
              <span className="text-xl font-bold text-ngen-red uppercase">
                {fullName?.[0] || profile?.email?.[0] || "?"}
              </span>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">{fullName || "No name set"}</p>
              <p className="text-xs text-gray-400">{profile?.email}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-ngen-red/10 text-ngen-red capitalize">
                  {profile?.role}
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 capitalize">
                  {profile?.plan} plan
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ngen-red/20 focus:border-ngen-red/40 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email</label>
              <input
                type="email"
                value={profile?.email || ""}
                disabled
                className="w-full px-3 py-2.5 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-400 cursor-not-allowed"
              />
              <p className="text-[10px] text-gray-400 mt-1">Email cannot be changed here.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Role</label>
                <input
                  value={profile?.role || ""}
                  disabled
                  className="w-full px-3 py-2.5 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-400 cursor-not-allowed capitalize"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Plan</label>
                <input
                  value={profile?.plan || ""}
                  disabled
                  className="w-full px-3 py-2.5 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-400 cursor-not-allowed capitalize"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 bg-ngen-red text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
              {saved && (
                <span className="text-xs text-emerald-600 font-semibold">Saved!</span>
              )}
            </div>
          </form>
        </div>

        {/* Account info */}
        {profile?.created_at && (
          <p className="text-[11px] text-gray-400 text-center mt-4">
            Member since {new Date(profile.created_at).toLocaleDateString("en-CA", { month: "long", year: "numeric" })}
          </p>
        )}
      </div>
    </div>
  );
}
