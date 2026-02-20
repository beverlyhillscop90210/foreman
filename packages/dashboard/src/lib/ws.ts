// WebSocket client for Foreman Bridge
const WS_URL = import.meta.env.VITE_WS_URL || 'wss://foreman.beverlyhillscop.io/ws';

export interface AgentOutputMessage {
  type: 'agent_output';
  taskId: string;
  line: string;
  stream: 'stdout' | 'stderr';
  timestamp: string;
}

export interface TaskEventMessage {
  type: 'task_event';
  taskId: string;
  event: 'started' | 'completed' | 'failed';
  timestamp: string;
}

export type WebSocketMessage = AgentOutputMessage | TaskEventMessage;

type MessageHandler = (message: WebSocketMessage) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectTimeout: number | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private isIntentionallyClosed = false;

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.isIntentionallyClosed = false;
    console.log('[WebSocket] Connecting to', this.url);

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[WebSocket] Connected');
        this.reconnectDelay = 1000; // Reset reconnect delay on successful connection
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;
          this.handlers.forEach(handler => handler(message));
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };

      this.ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        this.ws = null;

        // Attempt to reconnect unless intentionally closed
        if (!this.isIntentionallyClosed) {
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      console.error('[WebSocket] Connection failed:', error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return;
    }

    console.log(`[WebSocket] Reconnecting in ${this.reconnectDelay}ms...`);
    this.reconnectTimeout = window.setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
      // Exponential backoff with max delay
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    }, this.reconnectDelay);
  }

  disconnect(): void {
    this.isIntentionallyClosed = true;
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    
    // Return unsubscribe function
    return () => {
      this.handlers.delete(handler);
    };
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Export singleton instance
export const wsClient = new WebSocketClient(WS_URL);

