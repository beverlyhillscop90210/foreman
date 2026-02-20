// API client for Foreman Bridge
const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'https://foreman.beverlyhillscop.io';
const AUTH_TOKEN = import.meta.env.VITE_BRIDGE_TOKEN || '1ba489d45352894d3b6b74121a498a826cf8252490119d29127add4d0c00c4e3';

export interface Task {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'reviewing' | 'approved' | 'rejected' | 'failed' | 'completed' | 'qc_failed';
  agent: string;
  model?: string;
  project: string;
  briefing: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  output?: any[];
  allowed_files: string[];
  blocked_files: string[];
  verification?: string;
}

export interface HealthStatus {
  status: string;
  service: string;
}

export interface ConfigEntry {
  key: string;
  value: string;
  category: string;
  description?: string;
  masked?: boolean;
  updated_at?: string;
}

export interface ConfigEntryInput {
  value: string;
  category?: string;
  description?: string;
  masked?: boolean;
}

class BridgeAPI {
  private baseUrl: string;
  private authToken: string;

  constructor(baseUrl: string, authToken: string) {
    this.baseUrl = baseUrl;
    this.authToken = authToken;
  }

  private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.authToken}`,
      ...options?.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // Get all tasks
  async getTasks(): Promise<Task[]> {
    const response = await this.fetch<{ tasks: Task[] }>('/tasks');
    return response.tasks;
  }

  // Get single task
  async getTask(id: string): Promise<Task> {
    return this.fetch<Task>(`/tasks/${id}`);
  }

  // Create a new task
  async createTask(
    title: string,
    briefing: string,
    project: string,
    agent: string,
    allowed_files: string[] = [],
    blocked_files: string[] = []
  ): Promise<Task> {
    return this.fetch<Task>('/tasks', {
      method: 'POST',
      body: JSON.stringify({ title, briefing, project, agent, allowed_files, blocked_files }),
    });
  }

  // Get task diff
  async getTaskDiff(id: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/tasks/${id}/diff`, {
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
      },
    });
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }

  // Start task
  async startTask(id: string): Promise<{ success: boolean; message: string }> {
    return this.fetch<{ success: boolean; message: string }>(`/tasks/${id}/start`, {
      method: 'POST',
    });
  }

  // Approve task
  async approveTask(id: string): Promise<{ success: boolean; message: string }> {
    return this.fetch<{ success: boolean; message: string }>(`/tasks/${id}/approve`, {
      method: 'POST',
    });
  }

  // Reject task
  async rejectTask(id: string, feedback: string): Promise<{ success: boolean; message: string }> {
    return this.fetch<{ success: boolean; message: string }>(`/tasks/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ feedback }),
    });
  }

  // Get health status
  async getHealth(): Promise<HealthStatus> {
    return this.fetch<HealthStatus>('/health');
  }

  // Get all config entries
  async getConfig(reveal: boolean = false): Promise<ConfigEntry[]> {
    return this.fetch<ConfigEntry[]>(`/config${reveal ? '?reveal=true' : ''}`);
  }

  // Get single config entry
  async getConfigEntry(key: string, reveal: boolean = false): Promise<ConfigEntry> {
    return this.fetch<ConfigEntry>(`/config/${key}${reveal ? '?reveal=true' : ''}`);
  }

  // Set/update config entry
  async setConfig(key: string, input: ConfigEntryInput): Promise<ConfigEntry> {
    return this.fetch<ConfigEntry>(`/config/${key}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  }

  // Delete config entry
  async deleteConfig(key: string): Promise<{ success: boolean; message: string }> {
    return this.fetch<{ success: boolean; message: string }>(`/config/${key}`, {
      method: 'DELETE',
    });
  }
}

// Export singleton instance
export const api = new BridgeAPI(BRIDGE_URL, AUTH_TOKEN);

