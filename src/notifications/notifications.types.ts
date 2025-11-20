export type TemplateKey =
  | 'order_created'
  | 'order_status_changed'
  | 'order_assigned_driver'
  | 'order_out_for_delivery'
  | 'order_delivered'
  | 'order_canceled'
  | 'loyalty_earned'
  | 'loyalty_redeemed';

export interface NotificationJob {
  key: TemplateKey;
  userId: string;
  data: Record<string, any>;
}
