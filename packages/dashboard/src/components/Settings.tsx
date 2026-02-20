import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { Key, Shield, Users, Plus, Trash2, Copy, Check } from "lucide-react";

export function Settings() {
  const [profile, setProfile] = useState<any>(null);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [pats, setPats] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // New Key Form
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [newKeyService, setNewKeyService] = useState("openai");

  // New PAT Form
  const [newPatName, setNewPatName] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Fetch profile
    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    
    setProfile(profileData);

    // Fetch API Keys
    const { data: keysData } = await supabase
      .from("api_keys")
      .select("id, name, service, created_at")
      .order("created_at", { ascending: false });
    
    if (keysData) setApiKeys(keysData);

    // Fetch PATs
    const { data: patsData } = await supabase
      .from("personal_access_tokens")
      .select("id, name, token, created_at")
      .order("created_at", { ascending: false });
    
    if (patsData) setPats(patsData);

    // If admin, fetch users
    if (profileData?.role === "admin") {
      const { data: usersData } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (usersData) setUsers(usersData);
    }

    setLoading(false);
  };

  const handleAddApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("api_keys").insert({
      user_id: user.id,
      name: newKeyName,
      service: newKeyService,
      key_value: newKeyValue,
    });

    if (!error) {
      setNewKeyName("");
      setNewKeyValue("");
      fetchData();
    } else {
      alert("Error adding API key: " + error.message);
    }
  };

  const handleDeleteApiKey = async (id: string) => {
    const { error } = await supabase.from("api_keys").delete().eq("id", id);
    if (!error) fetchData();
  };

  const handleAddPat = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Generate a random token starting with fm_
    const token = "fm_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    const { error } = await supabase.from("personal_access_tokens").insert({
      user_id: user.id,
      name: newPatName,
      token: token,
    });

    if (!error) {
      setNewPatName("");
      fetchData();
    } else {
      alert("Error adding PAT: " + error.message);
    }
  };

  const handleDeletePat = async (id: string) => {
    const { error } = await supabase.from("personal_access_tokens").delete().eq("id", id);
    if (!error) fetchData();
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    const { error } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", userId);
    
    if (!error) fetchData();
    else alert("Error updating role: " + error.message);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return <div className="p-8 text-[var(--color-text-muted)]">Loading settings...</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-[var(--color-background)] text-[var(--color-text-primary)]">
      <div className="max-w-4xl mx-auto space-y-8">
        
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-accent)] mb-2">Settings</h1>
          <p className="text-[var(--color-text-muted)]">Manage your account, API keys, and access tokens.</p>
        </div>

        {/* Profile Section */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="text-[var(--color-accent)]" />
            <h2 className="text-xl font-semibold">Profile</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[var(--color-text-muted)] mb-1">Email</label>
              <div className="font-mono bg-[var(--color-background)] p-2 rounded border border-[var(--color-border)]">
                {profile?.email}
              </div>
            </div>
            <div>
              <label className="block text-sm text-[var(--color-text-muted)] mb-1">Role</label>
              <div className="font-mono bg-[var(--color-background)] p-2 rounded border border-[var(--color-border)] capitalize">
                {profile?.role}
              </div>
            </div>
          </div>
          <div className="mt-6">
            <button 
              onClick={() => supabase.auth.signOut()}
              className="px-4 py-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Admin Section */}
        {profile?.role === "admin" && (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <Users className="text-[var(--color-accent)]" />
              <h2 className="text-xl font-semibold">User Management (Admin)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                    <th className="pb-2 font-medium">Email</th>
                    <th className="pb-2 font-medium">Role</th>
                    <th className="pb-2 font-medium">Joined</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-b border-[var(--color-border)]/50 last:border-0">
                      <td className="py-3">{u.email}</td>
                      <td className="py-3 capitalize">
                        <select 
                          value={u.role}
                          onChange={(e) => handleUpdateRole(u.id, e.target.value)}
                          disabled={u.id === profile.id}
                          className="bg-[var(--color-background)] border border-[var(--color-border)] rounded px-2 py-1 text-sm"
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="py-3 text-sm text-[var(--color-text-muted)]">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        {/* Add more actions if needed */}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* API Keys Section */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <Key className="text-[var(--color-accent)]" />
            <h2 className="text-xl font-semibold">API Keys</h2>
          </div>
          <p className="text-sm text-[var(--color-text-muted)] mb-6">
            Add your API keys here. They are securely stored and can be used by the MCP server, but cannot be read back.
          </p>

          <form onSubmit={handleAddApiKey} className="flex gap-4 mb-6 items-end">
            <div className="flex-1">
              <label className="block text-sm text-[var(--color-text-muted)] mb-1">Name</label>
              <input 
                type="text" 
                required
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
                placeholder="e.g. My OpenAI Key"
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded px-3 py-2 focus:outline-none focus:border-[var(--color-accent)]"
              />
            </div>
            <div className="w-48">
              <label className="block text-sm text-[var(--color-text-muted)] mb-1">Service</label>
              <select 
                value={newKeyService}
                onChange={e => setNewKeyService(e.target.value)}
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded px-3 py-2 focus:outline-none focus:border-[var(--color-accent)]"
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="github">GitHub</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm text-[var(--color-text-muted)] mb-1">Key Value</label>
              <input 
                type="password" 
                required
                value={newKeyValue}
                onChange={e => setNewKeyValue(e.target.value)}
                placeholder="sk-..."
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded px-3 py-2 focus:outline-none focus:border-[var(--color-accent)]"
              />
            </div>
            <button type="submit" className="bg-[var(--color-accent)] text-black px-4 py-2 rounded font-medium flex items-center gap-2 hover:opacity-90 transition-opacity">
              <Plus size={18} /> Add
            </button>
          </form>

          <div className="space-y-3">
            {apiKeys.length === 0 ? (
              <div className="text-center py-4 text-[var(--color-text-muted)] border border-dashed border-[var(--color-border)] rounded">
                No API keys added yet.
              </div>
            ) : (
              apiKeys.map(key => (
                <div key={key.id} className="flex items-center justify-between p-3 bg-[var(--color-background)] border border-[var(--color-border)] rounded">
                  <div>
                    <div className="font-medium">{key.name}</div>
                    <div className="text-xs text-[var(--color-text-muted)] capitalize">{key.service} • Added {new Date(key.created_at).toLocaleDateString()}</div>
                  </div>
                  <button 
                    onClick={() => handleDeleteApiKey(key.id)}
                    className="text-[var(--color-text-muted)] hover:text-red-500 transition-colors p-2"
                    title="Delete Key"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Personal Access Tokens Section */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="text-[var(--color-accent)]" />
            <h2 className="text-xl font-semibold">Personal Access Tokens (MCP)</h2>
          </div>
          <p className="text-sm text-[var(--color-text-muted)] mb-6">
            Generate tokens to authenticate your local Claude Desktop MCP server with this Foreman instance.
          </p>

          <form onSubmit={handleAddPat} className="flex gap-4 mb-6 items-end">
            <div className="flex-1">
              <label className="block text-sm text-[var(--color-text-muted)] mb-1">Token Name</label>
              <input 
                type="text" 
                required
                value={newPatName}
                onChange={e => setNewPatName(e.target.value)}
                placeholder="e.g. MacBook Pro Claude"
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded px-3 py-2 focus:outline-none focus:border-[var(--color-accent)]"
              />
            </div>
            <button type="submit" className="bg-[var(--color-accent)] text-black px-4 py-2 rounded font-medium flex items-center gap-2 hover:opacity-90 transition-opacity">
              <Plus size={18} /> Generate
            </button>
          </form>

          <div className="space-y-3">
            {pats.length === 0 ? (
              <div className="text-center py-4 text-[var(--color-text-muted)] border border-dashed border-[var(--color-border)] rounded">
                No tokens generated yet.
              </div>
            ) : (
              pats.map(pat => (
                <div key={pat.id} className="flex items-center justify-between p-3 bg-[var(--color-background)] border border-[var(--color-border)] rounded">
                  <div>
                    <div className="font-medium">{pat.name}</div>
                    <div className="text-xs text-[var(--color-text-muted)]">Created {new Date(pat.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="font-mono text-sm bg-[var(--color-surface)] px-2 py-1 rounded border border-[var(--color-border)]">
                      {pat.token}
                    </div>
                    <button 
                      onClick={() => copyToClipboard(pat.token, pat.id)}
                      className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors p-2"
                      title="Copy Token"
                    >
                      {copiedId === pat.id ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                    </button>
                    <button 
                      onClick={() => handleDeletePat(pat.id)}
                      className="text-[var(--color-text-muted)] hover:text-red-500 transition-colors p-2"
                      title="Revoke Token"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
