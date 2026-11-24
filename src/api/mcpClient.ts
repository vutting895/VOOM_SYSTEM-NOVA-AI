import { getSupabaseClient } from '../lib/supabase';

const MCP_ENDPOINT = 'https://voom-system-mcp.suwapat787.workers.dev/mcp';
const PROTOCOL_VERSION = '2025-03-26';

type JsonRpcResponse<T> = {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: T;
  error?: { code: number; message: string };
};

async function postRpc<T>(body: Record<string, unknown>, token: string): Promise<T | undefined> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(MCP_ENDPOINT, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (response.status === 202 && String(body.method).startsWith('notifications/')) return undefined;
    if (!response.ok) throw new Error(`nova_gateway_http_${response.status}`);
    const payload = await response.json() as JsonRpcResponse<T>;
    if (!payload || payload.jsonrpc !== '2.0' || payload.error) {
      throw new Error(payload?.error?.message || 'nova_gateway_protocol_error');
    }
    return payload.result;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function callNovaMcpTool<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error || !data.session?.access_token) throw new Error('authentication_required');
  const token = data.session.access_token;

  await postRpc({
    jsonrpc: '2.0',
    id: 'nova-frontend-init',
    method: 'initialize',
    params: {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'nova-web-frontend', version: '1.0.0' },
    },
  }, token);

  await postRpc({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {},
  }, token);

  const response = await postRpc<{
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  }>({
    jsonrpc: '2.0',
    id: 'nova-frontend-tool-call',
    method: 'tools/call',
    params: { name, arguments: args },
  }, token);

  if (!response) throw new Error('nova_gateway_tool_failed');
  const text = response.content?.find((item) => item.type === 'text' && typeof item.text === 'string')?.text;
  if (!text) throw new Error('nova_gateway_invalid_tool_result');
  if (response.isError) throw new Error(text);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('nova_gateway_invalid_tool_payload');
  }
}
