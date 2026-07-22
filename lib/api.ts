import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

/**
 * CSCBilling API client for the driver app.
 *
 * Replaces the previous Supabase client, which could never have worked: no
 * project URL or key was ever configured, and the `bookings`/`drivers` tables
 * it queried live in a different system from the Mongo database the console and
 * billing actually run on. Everything now speaks to CSCBilling.
 *
 * The token goes in the device keystore rather than AsyncStorage — a driver
 * token can accept rides and close trips with money attached to them, so it
 * deserves hardware-backed storage.
 */

const BILLING_URL = (Constants.expoConfig?.extra?.BILLING_URL as string | undefined)
  ?? 'https://app.csctravels.com';

const TOKEN_KEY = 'cscdriver.token';

let tokenMemo: string | null = null;

export async function getToken(): Promise<string | null> {
  if (tokenMemo) return tokenMemo;
  try {
    tokenMemo = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    tokenMemo = null;
  }
  return tokenMemo;
}

export async function setToken(token: string | null) {
  tokenMemo = token;
  try {
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch (e) {
    console.warn('Could not persist driver token', e);
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  auth?: boolean;
  /** Abort after this many ms. Drivers are often on poor mobile data. */
  timeoutMs?: number;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { body, auth = true, headers, timeoutMs = 15000, ...rest } = opts;

  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string> | undefined),
  };

  if (auth) {
    const token = await getToken();
    if (token) h.Authorization = `Bearer ${token}`;
  }

  // Without this a dead network hangs the polling loop forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${BILLING_URL}${path}`, {
      ...rest,
      headers: h,
      signal: controller.signal,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e: any) {
    clearTimeout(timer);
    throw new ApiError(
      e?.name === 'AbortError' ? 'Network timed out. Check your connection.' : 'No internet connection.',
      0,
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { error: text };
  }

  if (!res.ok || parsed?.success === false) {
    throw new ApiError(parsed?.error ?? parsed?.message ?? `Request failed (${res.status})`, res.status);
  }

  return parsed as T;
}

export { BILLING_URL };
