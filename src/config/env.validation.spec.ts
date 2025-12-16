import { validateEnv } from './env.validation';

describe('env.validation', () => {
  const minimal = {
    NODE_ENV: 'production',
    DATABASE_URL: 'http://localhost',
    JWT_ACCESS_SECRET: 'access-secret-value',
    JWT_REFRESH_SECRET: 'refresh-secret-value',
    UPLOADS_DRIVER: 'local',
    LOCAL_UPLOADS_BASE_URL: 'http://localhost/uploads',
  } as Record<string, unknown>;

  it('requires AUTOMATION_WEBHOOK_SECRET in production', () => {
    expect(() => validateEnv({ ...minimal })).toThrow(/AUTOMATION_WEBHOOK_SECRET is required in production/);
  });

  it('accepts config when AUTOMATION_WEBHOOK_SECRET is provided', () => {
    expect(() =>
      validateEnv({
        ...minimal,
        AUTOMATION_WEBHOOK_SECRET: 'static-secret',
      }),
    ).not.toThrow();
  });
});
