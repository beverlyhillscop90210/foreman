import { EventEmitter } from 'events';
import type { IncomingMessage } from 'http';
import type { WebSocket } from 'ws';
import type { KanbanEvent } from './types.js';

/**
 * WebSocketManager handles WebSocket connections and broadcasts events
 */
export class WebSocketManager extends EventEmitter {
  private clients: Set<WebSocket> = new Set();
  private WebSocketServer: any;

  constructor(server: any) {
    super();
    this.initialize(server);
  }

  /**
   * Initialize WebSocket server
   */
  private async initialize(server: any): Promise<void> {
    // Dynamically import ws to avoid bundling issues
    const { WebSocketServer: WSS } = await import('ws');
    this.WebSocketServer = new WSS({ server });

    this.WebSocketServer.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      console.log('WebSocket client connected');
      this.clients.add(ws);

      ws.on('message', (message: string) => {
        try {
          const data = JSON.parse(message.toString());
          this.emit('message', data);
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      });

      ws.on('close', () => {
        console.log('WebSocket client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error: Error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });

      // Send initial connection message
      ws.send(JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }));
    });
  }

  /**
   * Broadcast event to all connected clients
   */
  broadcast(event: KanbanEvent | any): void {
    const message = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === 1) { // OPEN
        client.send(message);
      }
    }
  }

  /**
   * Get number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Close all connections
   */
  close(): void {
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
    if (this.WebSocketServer) {
      this.WebSocketServer.close();
    }
  }
}

