import { create } from 'zustand';
import { api } from '../lib/api';

export interface DeviceCapabilities {
  gpu?: string;
  cuda?: string;
  tensorrt?: string;
  python?: string;
  isaac_lab?: string;
  ollama?: { version: string; models: string[] };
  os?: string;
  arch?: string;
  memory_gb?: number;
  disk_gb?: number;
  custom?: Record<string, string>;
}

export type DeviceType = 'gpu_compute' | 'inference' | 'llm_endpoint' | 'general';
export type DeviceStatus = 'pending' | 'online' | 'offline' | 'error';

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  status: DeviceStatus;
  tunnel_id?: string;
  tunnel_hostname?: string;
  tunnel_token?: string;
  capabilities?: DeviceCapabilities;
  last_seen_at?: string;
  created_at: string;
  updated_at?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface CreateDeviceResponse {
  device: Device;
  connection_token: string;
  tunnel?: { hostname: string; tunnel_id: string } | null;
  install_instructions: string;
}

interface DevicesStore {
  devices: Device[];
  isLoading: boolean;
  error: string | null;
  // New device flow
  pendingDevice: CreateDeviceResponse | null;

  // Actions
  fetchDevices: () => Promise<void>;
  createDevice: (name: string, type: DeviceType, tags?: string[]) => Promise<CreateDeviceResponse>;
  deleteDevice: (id: string) => Promise<void>;
  clearPending: () => void;
}

export const useDevicesStore = create<DevicesStore>((set, get) => ({
  devices: [],
  isLoading: false,
  error: null,
  pendingDevice: null,

  fetchDevices: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.fetch<{ devices: Device[] }>('/devices');
      set({ devices: data.devices, isLoading: false });
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },

  createDevice: async (name, type, tags) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.fetch<CreateDeviceResponse>('/devices', {
        method: 'POST',
        body: JSON.stringify({ name, type, tags }),
      });
      set({ pendingDevice: result, isLoading: false });
      // Refresh device list
      get().fetchDevices();
      return result;
    } catch (err) {
      set({ error: String(err), isLoading: false });
      throw err;
    }
  },

  deleteDevice: async (id) => {
    try {
      await api.fetch(`/devices/${id}`, { method: 'DELETE' });
      set({ devices: get().devices.filter(d => d.id !== id) });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  clearPending: () => set({ pendingDevice: null }),
}));
