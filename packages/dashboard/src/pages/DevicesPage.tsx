import { useState, useEffect, useRef } from 'react';
import { useDevicesStore, type Device, type DeviceType } from '../stores/devicesStore';

// ── Device Type Labels ───────────────────────────────────────────
const TYPE_LABELS: Record<DeviceType, string> = {
  gpu_compute: 'GPU Compute',
  inference: 'Inference',
  llm_endpoint: 'LLM / Ollama',
  general: 'General',
};

const TYPE_ICONS: Record<DeviceType, string> = {
  gpu_compute: '⚡',
  inference: '🧠',
  llm_endpoint: '💬',
  general: '🖥',
};

const STATUS_COLORS: Record<string, string> = {
  online: 'bg-green-500',
  pending: 'bg-yellow-500',
  offline: 'bg-zinc-500',
  error: 'bg-red-500',
};

// ── Time helpers ─────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Setup Terminal Modal ─────────────────────────────────────────
function SetupTerminal({
  device,
  token,
  onClose,
}: {
  device: { id: string; name: string; type: DeviceType };
  token: string;
  onClose: () => void;
}) {
  const [os, setOs] = useState<'macos' | 'linux' | 'docker'>('linux');
  const [copied, setCopied] = useState(false);
  const [connected, setConnected] = useState(false);
  const termRef = useRef<HTMLPreElement>(null);
  const { fetchDevices, devices } = useDevicesStore();

  // Poll for device connection
  useEffect(() => {
    const interval = setInterval(async () => {
      await fetchDevices();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchDevices]);

  // Watch for online status
  useEffect(() => {
    const dev = devices.find((d) => d.id === device.id);
    if (dev?.status === 'online') {
      setConnected(true);
    }
  }, [devices, device.id]);

  const bridgeUrl = import.meta.env.VITE_BRIDGE_URL || 'https://foreman.beverlyhillscop.io';

  // Build the one-liner setup command
  const setupCommand = `curl -sfL "${bridgeUrl}/devices/${device.id}/setup-script?os=${os}" -o /tmp/foreman-setup.sh && DEVICE_TOKEN="${token}" bash /tmp/foreman-setup.sh`;

  // The manual steps (for display in the terminal)
  const manualSteps = [
    { step: 1, label: 'Install cloudflared', cmd: os === 'macos' ? 'brew install cloudflared' : os === 'docker' ? 'docker pull cloudflare/cloudflared:latest' : 'curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared' },
    { step: 2, label: 'Connect device to Foreman', cmd: `curl -X POST "${bridgeUrl}/devices/connect" \\\n  -H "Content-Type: application/json" \\\n  -d '{"token": "${token}"}'` },
  ];

  const handleCopy = () => {
    navigator.clipboard.writeText(setupCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-foreman-bg-deep border border-foreman-border w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-foreman-border bg-foreman-bg-dark">
          <div className="flex items-center gap-3">
            <span className="text-lg">{TYPE_ICONS[device.type]}</span>
            <div>
              <h3 className="font-mono text-sm text-foreman-orange">{device.name}</h3>
              <span className="font-sans text-xs text-foreman-text opacity-60">
                {TYPE_LABELS[device.type]} · {device.id}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-foreman-text hover:text-foreman-orange font-mono text-lg px-2"
          >
            ✕
          </button>
        </div>

        {/* Success Banner */}
        {connected && (
          <div className="bg-green-900/30 border-b border-green-700 px-5 py-3 flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
            <span className="font-mono text-sm text-green-400">
              Device connected successfully!
            </span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* OS Selector */}
          <div>
            <label className="block font-mono text-xs text-foreman-text mb-2 uppercase tracking-wider">
              Target OS
            </label>
            <div className="flex gap-2">
              {(['linux', 'macos', 'docker'] as const).map((o) => (
                <button
                  key={o}
                  onClick={() => setOs(o)}
                  className={`px-4 py-2 font-mono text-xs border transition-colors ${
                    os === o
                      ? 'bg-foreman-orange/20 border-foreman-orange text-foreman-orange'
                      : 'bg-foreman-bg-dark border-foreman-border text-foreman-text hover:border-foreman-orange'
                  }`}
                >
                  {o === 'macos' ? '🍎 macOS' : o === 'docker' ? '🐳 Docker' : '🐧 Linux'}
                </button>
              ))}
            </div>
          </div>

          {/* One-Click Command */}
          <div>
            <label className="block font-mono text-xs text-foreman-text mb-2 uppercase tracking-wider">
              Quick Setup — paste this in your terminal
            </label>
            <div className="relative group">
              <pre
                ref={termRef}
                className="bg-black border border-foreman-border p-4 font-mono text-sm text-green-400 overflow-x-auto whitespace-pre-wrap select-all"
              >
                <span className="text-zinc-500">$ </span>
                {setupCommand}
              </pre>
              <button
                onClick={handleCopy}
                className={`absolute top-2 right-2 px-3 py-1 font-mono text-xs border transition-colors ${
                  copied
                    ? 'bg-green-900/50 border-green-600 text-green-400'
                    : 'bg-foreman-bg-dark border-foreman-border text-foreman-text hover:border-foreman-orange opacity-0 group-hover:opacity-100'
                }`}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Device Token */}
          <div>
            <label className="block font-mono text-xs text-foreman-text mb-2 uppercase tracking-wider">
              Connection Token
            </label>
            <div className="bg-foreman-bg-dark border border-foreman-border p-3 font-mono text-xs text-yellow-400 break-all select-all">
              {token}
            </div>
            <p className="font-sans text-xs text-foreman-text opacity-50 mt-1">
              Single-use · Expires in 24h
            </p>
          </div>

          {/* Manual Steps */}
          <div>
            <label className="block font-mono text-xs text-foreman-text mb-2 uppercase tracking-wider">
              Or step-by-step
            </label>
            <div className="space-y-3">
              {manualSteps.map((s) => (
                <div key={s.step} className="bg-foreman-bg-dark border border-foreman-border p-3">
                  <div className="font-mono text-xs text-foreman-text opacity-70 mb-1">
                    Step {s.step}: {s.label}
                  </div>
                  <pre className="font-mono text-xs text-green-400 whitespace-pre-wrap select-all">
                    {s.cmd}
                  </pre>
                </div>
              ))}
            </div>
          </div>

          {/* Status */}
          <div className="bg-foreman-bg-dark border border-foreman-border p-4">
            <div className="flex items-center gap-3">
              {connected ? (
                <>
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="font-mono text-sm text-green-400">Connected</span>
                </>
              ) : (
                <>
                  <div className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse" />
                  <span className="font-mono text-sm text-yellow-400">
                    Waiting for device to connect...
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-foreman-border px-5 py-3 flex justify-end">
          <button
            onClick={onClose}
            className={`font-sans text-xs px-4 py-2 ${
              connected
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-foreman-bg-medium border border-foreman-border text-foreman-text hover:border-foreman-orange'
            }`}
          >
            {connected ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add Device Modal ─────────────────────────────────────────────
function AddDeviceModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<DeviceType>('gpu_compute');
  const [tags, setTags] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [result, setResult] = useState<{ device: { id: string; name: string; type: DeviceType }; token: string } | null>(null);
  const createDevice = useDevicesStore((s) => s.createDevice);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setIsCreating(true);
    try {
      const res = await createDevice(name.trim(), type, tags ? tags.split(',').map((t) => t.trim()) : undefined);
      setResult({ device: { id: res.device.id, name: res.device.name, type: res.device.type }, token: res.connection_token });
    } catch (e) {
      console.error('Failed to create device:', e);
    } finally {
      setIsCreating(false);
    }
  };

  // If created, show the setup terminal
  if (result) {
    return <SetupTerminal device={result.device} token={result.token} onClose={onClose} />;
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-foreman-bg-deep border border-foreman-border w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-foreman-border bg-foreman-bg-dark">
          <h3 className="font-mono text-sm text-foreman-orange">Add Device</h3>
          <button
            onClick={onClose}
            className="text-foreman-text hover:text-foreman-orange font-mono text-lg px-2"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <div className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block font-mono text-xs text-foreman-text mb-1 uppercase tracking-wider">
              Device Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. dgx-spark-01, jetson-orin-kitchen"
              className="w-full bg-foreman-bg-dark border border-foreman-border text-foreman-text
                         font-mono text-sm px-3 py-2 focus:outline-none focus:border-foreman-orange"
              autoFocus
            />
          </div>

          {/* Type */}
          <div>
            <label className="block font-mono text-xs text-foreman-text mb-2 uppercase tracking-wider">
              Device Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(TYPE_LABELS) as DeviceType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`px-3 py-2 text-left font-mono text-xs border transition-colors ${
                    type === t
                      ? 'bg-foreman-orange/20 border-foreman-orange text-foreman-orange'
                      : 'bg-foreman-bg-dark border-foreman-border text-foreman-text hover:border-foreman-orange'
                  }`}
                >
                  <span className="mr-2">{TYPE_ICONS[t]}</span>
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block font-mono text-xs text-foreman-text mb-1 uppercase tracking-wider">
              Tags <span className="text-foreman-text opacity-40">(optional, comma-separated)</span>
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. production, rack-2, lab"
              className="w-full bg-foreman-bg-dark border border-foreman-border text-foreman-text
                         font-mono text-sm px-3 py-2 focus:outline-none focus:border-foreman-orange"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-foreman-border px-5 py-3 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="bg-foreman-bg-medium border border-foreman-border text-foreman-text
                       font-sans text-xs px-4 py-2 hover:border-foreman-orange"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || isCreating}
            className="bg-foreman-orange text-white font-sans text-xs px-4 py-2 hover:bg-opacity-90
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isCreating ? 'Creating...' : 'Create & Connect'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Device Row ───────────────────────────────────────────────────
function DeviceRow({ device, onDelete }: { device: Device; onDelete: (id: string) => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <tr className="border-b border-foreman-border hover:bg-foreman-bg-medium transition-colors">
      {/* Status + Name */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[device.status] || 'bg-zinc-500'} ${device.status === 'online' ? 'animate-pulse' : ''}`} />
          <div>
            <span className="font-mono text-sm text-foreman-orange">{device.name}</span>
            <div className="font-mono text-[11px] text-foreman-text opacity-40">{device.id}</div>
          </div>
        </div>
      </td>

      {/* Type */}
      <td className="px-4 py-3">
        <span className="font-mono text-xs text-foreman-text">
          {TYPE_ICONS[device.type]} {TYPE_LABELS[device.type]}
        </span>
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1.5 font-mono text-xs px-2 py-0.5 border ${
          device.status === 'online'
            ? 'border-green-700 text-green-400 bg-green-900/20'
            : device.status === 'pending'
            ? 'border-yellow-700 text-yellow-400 bg-yellow-900/20'
            : 'border-zinc-700 text-zinc-400 bg-zinc-900/20'
        }`}>
          {device.status}
        </span>
      </td>

      {/* Capabilities */}
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {device.capabilities?.gpu && (
            <span className="font-mono text-[11px] text-foreman-text bg-foreman-bg-dark border border-foreman-border px-1.5 py-0.5">
              GPU: {device.capabilities.gpu}
            </span>
          )}
          {device.capabilities?.ollama && (
            <span className="font-mono text-[11px] text-foreman-text bg-foreman-bg-dark border border-foreman-border px-1.5 py-0.5">
              Ollama: {device.capabilities.ollama.models?.length || 0} models
            </span>
          )}
          {device.capabilities?.memory_gb && (
            <span className="font-mono text-[11px] text-foreman-text bg-foreman-bg-dark border border-foreman-border px-1.5 py-0.5">
              {device.capabilities.memory_gb}GB RAM
            </span>
          )}
          {!device.capabilities?.gpu && !device.capabilities?.ollama && !device.capabilities?.memory_gb && (
            <span className="font-mono text-[11px] text-foreman-text opacity-40">—</span>
          )}
        </div>
      </td>

      {/* Last Seen */}
      <td className="px-4 py-3 font-mono text-xs text-foreman-text opacity-60">
        {device.last_seen_at ? timeAgo(device.last_seen_at) : device.status === 'pending' ? 'never' : '—'}
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        {confirmDelete ? (
          <div className="flex gap-2">
            <button
              onClick={() => {
                onDelete(device.id);
                setConfirmDelete(false);
              }}
              className="bg-red-600 border border-red-700 text-white font-sans text-xs px-3 py-1 hover:bg-red-700"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="bg-foreman-bg-medium border border-foreman-border text-foreman-text
                         font-sans text-xs px-3 py-1 hover:border-foreman-orange"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="bg-foreman-bg-medium border border-foreman-border text-foreman-text
                       font-sans text-xs px-3 py-1 hover:border-red-500 hover:text-red-400"
            title="Delete device"
          >
            🗑
          </button>
        )}
      </td>
    </tr>
  );
}

// ── Devices Page ─────────────────────────────────────────────────
export function DevicesPage() {
  const { devices, isLoading, error, fetchDevices, deleteDevice } = useDevicesStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [filter, setFilter] = useState<'all' | 'online' | 'pending' | 'offline'>('all');

  useEffect(() => {
    fetchDevices();
    // Poll every 10s
    const interval = setInterval(fetchDevices, 10000);
    return () => clearInterval(interval);
  }, [fetchDevices]);

  const filtered = filter === 'all' ? devices : devices.filter((d) => d.status === filter);
  const counts = {
    all: devices.length,
    online: devices.filter((d) => d.status === 'online').length,
    pending: devices.filter((d) => d.status === 'pending').length,
    offline: devices.filter((d) => d.status === 'offline').length,
  };

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-lg text-foreman-orange tracking-wide">Devices</h1>
          <p className="font-sans text-sm text-foreman-text opacity-60 mt-1">
            Connect compute resources to Foreman via Cloudflare Tunnel
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-foreman-orange text-white font-sans text-sm px-4 py-2 hover:bg-opacity-90
                     flex items-center gap-2"
        >
          <span>+</span> Add Device
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 border-b border-foreman-border">
        {(['all', 'online', 'pending', 'offline'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`font-mono text-xs px-4 py-2 transition-colors ${
              filter === f
                ? 'text-foreman-orange border-b-2 border-foreman-orange'
                : 'text-foreman-text hover:text-foreman-orange'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            <span className="ml-1.5 text-foreman-text opacity-40">({counts[f]})</span>
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-700 px-4 py-3 font-mono text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && devices.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <span className="font-mono text-sm text-foreman-text opacity-60 animate-pulse">
            Loading devices...
          </span>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && devices.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="text-5xl opacity-30">🖥</div>
          <h2 className="font-mono text-sm text-foreman-text">No devices connected</h2>
          <p className="font-sans text-xs text-foreman-text opacity-50 text-center max-w-md">
            Add a device to connect your GPU workstations, Jetson boards, or Ollama endpoints
            to Foreman via Cloudflare Tunnel — zero port forwarding required.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-foreman-orange text-white font-sans text-xs px-4 py-2 hover:bg-opacity-90 mt-2"
          >
            Add Your First Device
          </button>
        </div>
      )}

      {/* Device Table */}
      {filtered.length > 0 && (
        <div className="border border-foreman-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-foreman-bg-dark border-b border-foreman-border">
                <th className="px-4 py-2 text-left font-mono text-xs text-foreman-text opacity-60 uppercase tracking-wider">
                  Device
                </th>
                <th className="px-4 py-2 text-left font-mono text-xs text-foreman-text opacity-60 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-2 text-left font-mono text-xs text-foreman-text opacity-60 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-2 text-left font-mono text-xs text-foreman-text opacity-60 uppercase tracking-wider">
                  Capabilities
                </th>
                <th className="px-4 py-2 text-left font-mono text-xs text-foreman-text opacity-60 uppercase tracking-wider">
                  Last Seen
                </th>
                <th className="px-4 py-2 text-left font-mono text-xs text-foreman-text opacity-60 uppercase tracking-wider w-24">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((device) => (
                <DeviceRow key={device.id} device={device} onDelete={deleteDevice} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* No matches for filter */}
      {!isLoading && filtered.length === 0 && devices.length > 0 && (
        <div className="text-center py-12">
          <span className="font-mono text-sm text-foreman-text opacity-50">
            No {filter} devices
          </span>
        </div>
      )}

      {/* Add Device Modal */}
      {showAddModal && <AddDeviceModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
}
