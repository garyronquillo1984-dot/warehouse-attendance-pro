// Talks to the "billing" Edge Function, which holds the Hotmart secrets. The browser never
// sees a secret and never decides whether someone has paid.
import { supabase } from './supabase';

export type BillingAction = 'checkout' | 'status' | 'verify' | 'cancel';
export interface BillingReply {
  ok?: boolean;
  url?: string;
  reason?: 'not_configured' | 'provider_error' | 'no_subscription' | 'not_found';
  manageUrl?: string;
  error?: string;
}

export async function billing(action: BillingAction): Promise<BillingReply> {
  const { data, error } = await supabase.functions.invoke('billing', { body: { action } });
  if (error) return { ok: false, reason: 'provider_error', error: error.message };
  return (data ?? { ok: false, reason: 'provider_error' }) as BillingReply;
}

export const HOTMART_MANAGE_URL = 'https://consumer.hotmart.com/purchase';
