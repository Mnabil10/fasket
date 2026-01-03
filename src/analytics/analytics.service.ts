import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { TrackEventsDto } from './dto/track-events.dto';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly clickhouseUrl = String(process.env.CLICKHOUSE_URL ?? '').trim();
  private readonly clickhouseDb = String(process.env.CLICKHOUSE_DB ?? 'fasket_analytics').trim();
  private readonly clickhouseUser = String(process.env.CLICKHOUSE_USER ?? '').trim();
  private readonly clickhousePassword = String(process.env.CLICKHOUSE_PASSWORD ?? '').trim();
  private readonly timeoutMs = Number(process.env.CLICKHOUSE_TIMEOUT_MS ?? 3000);
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: this.clickhouseUrl || undefined,
      timeout: Number.isFinite(this.timeoutMs) ? this.timeoutMs : 3000,
      auth: this.clickhouseUser
        ? { username: this.clickhouseUser, password: this.clickhousePassword }
        : undefined,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  async ingest(userId: string | null, payload: TrackEventsDto) {
    if (!this.clickhouseUrl) {
      this.logger.warn('ClickHouse not configured; analytics events skipped.');
      return { success: true, skipped: true, count: payload.events.length };
    }

    const now = new Date();
    const rows = payload.events.map((event) => ({
      event_time: event.ts ?? now,
      received_at: now,
      name: event.name,
      user_id: userId ?? '',
      session_id: payload.sessionId ?? '',
      device_id: payload.deviceId ?? '',
      platform: payload.platform ?? '',
      app_version: payload.appVersion ?? '',
      locale: payload.locale ?? '',
      source: payload.source ?? 'mobile',
      payload: JSON.stringify(event.params ?? {}),
    }));

    const body = rows.map((row) => JSON.stringify(row)).join('\n');
    const query = `INSERT INTO ${this.clickhouseDb}.events FORMAT JSONEachRow`;
    try {
      await this.http.post(`/?query=${encodeURIComponent(query)}`, body);
      return { success: true, count: rows.length };
    } catch (error) {
      this.logger.error({
        msg: 'Failed to insert analytics events',
        error: (error as Error).message,
      });
      return { success: false, count: 0 };
    }
  }
}
