import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

export type OrderRealtimePayload = {
  orderId: string;
  orderCode?: string | null;
  status?: string | null;
  providerId?: string | null;
  createdAt?: string | null;
  updatedAt: string;
};

@WebSocketGateway({
  namespace: '/orders',
  cors: { origin: true, credentials: true },
  pingInterval: 25000,
  pingTimeout: 20000,
})
export class OrdersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(OrdersGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
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
      const userId = String(payload?.sub ?? '');
      const role = String(payload?.role ?? '').toUpperCase();
      if (!userId) {
        client.disconnect(true);
        return;
      }
      client.data.userId = userId;
      client.data.role = role;
      if (['ADMIN', 'STAFF', 'OPS_MANAGER', 'FINANCE'].includes(role)) {
        client.join('admins');
      }
      if (role === 'PROVIDER') {
        const memberships = await this.prisma.providerUser.findMany({
          where: { userId, provider: { status: 'ACTIVE' } },
          select: { providerId: true },
        });
        memberships.forEach((membership) => client.join(`provider:${membership.providerId}`));
        client.data.providerIds = memberships.map((membership) => membership.providerId);
      }
      this.logger.debug({ msg: 'Orders socket connected', userId, role });
    } catch (err) {
      this.logger.warn({ msg: 'Orders socket auth failed', error: (err as Error)?.message });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.userId;
    this.logger.debug({ msg: 'Orders socket disconnected', userId });
  }

  emitAdminNewOrder(payload: OrderRealtimePayload) {
    if (!this.server) return;
    this.server.to('admins').emit('admin:new_order', payload);
  }

  emitAdminOrderStatus(payload: OrderRealtimePayload) {
    if (!this.server) return;
    this.server.to('admins').emit('admin:order_status', payload);
  }

  emitProviderNewOrder(providerId: string, payload: OrderRealtimePayload) {
    if (!this.server) return;
    this.server.to(`provider:${providerId}`).emit('provider:new_order', payload);
  }

  emitProviderOrderStatus(providerId: string, payload: OrderRealtimePayload) {
    if (!this.server) return;
    this.server.to(`provider:${providerId}`).emit('provider:order_status', payload);
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
