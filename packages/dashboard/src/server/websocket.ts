import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import { taskRunner } from './services/taskRunner';
import type { AgentOutputMessage, TaskEventMessage } from './types';

export class WebSocketManager {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ noServer: true });

    // Handle upgrade requests
    server.on('upgrade', (request: IncomingMessage, socket, head) => {
      const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
      
      if (pathname === '/ws') {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    // Handle WebSocket connections
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('WebSocket client connected');
      this.clients.add(ws);

      ws.on('close', () => {
        console.log('WebSocket client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });
    });

    // Listen to TaskRunner events and broadcast to all clients
    this.setupTaskRunnerListeners();
  }

  private setupTaskRunnerListeners(): void {
    // Listen for task output events
    taskRunner.on('task:output', (event) => {
      const message: AgentOutputMessage = {
        type: 'agent_output',
        taskId: event.taskId,
        line: event.line,
        stream: event.stream,
        timestamp: new Date().toISOString(),
      };

      this.broadcast(message);
    });

    // Listen for task lifecycle events
    taskRunner.on('task:lifecycle', (event) => {
      const message: TaskEventMessage = {
        type: 'task_event',
        taskId: event.taskId,
        event: event.event,
        timestamp: new Date().toISOString(),
      };

      this.broadcast(message);
    });
  }

  private broadcast(message: AgentOutputMessage | TaskEventMessage): void {
    const data = JSON.stringify(message);
    
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  getConnectedClientsCount(): number {
    return this.clients.size;
  }
}

