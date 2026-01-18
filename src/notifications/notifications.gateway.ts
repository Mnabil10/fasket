import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

export type AdminRealtimeNotification = {
  id: string;
  title: string;
  body: string;
  type: string;
  data: Record<string, any>;
  createdAt: string;
  priority: string;
};

@WebSocketGateway({
  namespace: '/admin/notifications',
  cors: { origin: true, credentials: true },
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    const token = this.extractToken(client);
    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET') ?? '',
      });
      const role = String(payload?.role ?? '').toUpperCase();
      if (!['ADMIN', 'STAFF'].includes(role)) {
        client.disconnect(true);
        return;
      }
      const userId = String(payload?.sub ?? '');
      client.data.userId = userId;
      client.data.role = role;
      client.join('admins');
      if (userId) {
        client.join(`user:${userId}`);
      }
      client.join(`role:${role}`);
      this.logger.debug({ msg: 'Admin socket connected', userId, role });
    } catch (err) {
      this.logger.warn({ msg: 'Admin socket auth failed', error: (err as Error)?.message });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.userId;
    this.logger.debug({ msg: 'Admin socket disconnected', userId });
  }

  emitAdminNotification(payload: AdminRealtimeNotification) {
    if (!this.server) return;
    this.server.to('admins').emit('notification', payload);
  }

  private extractToken(client: Socket) {
    const authToken = client.handshake.auth?.token;
    if (authToken) return authToken as string;
    const header = client.handshake.headers?.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice(7);
    }
    const queryToken = client.handshake.query?.token;
    if (typeof queryToken === 'string') return queryToken;
    return null;
  }
}
