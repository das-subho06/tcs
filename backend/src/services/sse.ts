import { Response } from 'express';

interface ClientConnection {
  sessionId: string;
  res: Response;
}

class SSEManager {
  private clients: ClientConnection[] = [];

  addClient(sessionId: string, res: Response) {
    this.clients.push({ sessionId, res });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    // Send initial connected message
    res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);

    res.on('close', () => {
      this.removeClient(res);
    });
  }

  removeClient(res: Response) {
    this.clients = this.clients.filter(c => c.res !== res);
  }

  broadcastSessionEvent(sessionId: string, data: any) {
    const sessionClients = this.clients.filter(c => c.sessionId === sessionId);
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of sessionClients) {
      try {
        client.res.write(payload);
      } catch (err) {
        this.removeClient(client.res);
      }
    }
  }
}

export const sseManager = new SSEManager();
