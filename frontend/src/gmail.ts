import { getAccessToken } from './auth';
import { INBOX_PAGE_SIZE } from './config';
import { Email } from './utils/types';

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

// ---------- base64url decode (UTF-8 safe, kisi extra library ke bina) ----------
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64UrlToBytes(input: string): number[] {
  const str = input.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < str.length; i++) {
    const idx = CHARS.indexOf(str[i]);
    if (idx < 0) {
      continue;
    }
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return bytes;
}

function utf8Decode(bytes: number[]): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i++];
    if (b < 0x80) {
      out += String.fromCharCode(b);
    } else if (b < 0xe0) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
    } else if (b < 0xf0) {
      out += String.fromCharCode(
        ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f),
      );
    } else {
      const cp =
        ((b & 0x07) << 18) |
        ((bytes[i++] & 0x3f) << 12) |
        ((bytes[i++] & 0x3f) << 6) |
        (bytes[i++] & 0x3f);
      const c = cp - 0x10000;
      out += String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 0x3ff));
    }
  }
  return out;
}

function decodeBody(data?: string): string {
  if (!data) {
    return '';
  }
  return utf8Decode(base64UrlToBytes(data));
}

// ---------- Gmail payload parsing ----------
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>/gi, ' $1 ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

function extractBody(payload: any): string {
  if (!payload) {
    return '';
  }

  let plain = '';
  let html = '';

  const walk = (part: any) => {
    if (!part) {
      return;
    }
    if (part.mimeType === 'text/plain' && part.body?.data && !plain) {
      plain = decodeBody(part.body.data);
    } else if (part.mimeType === 'text/html' && part.body?.data && !html) {
      html = decodeBody(part.body.data);
    }
    if (Array.isArray(part.parts)) {
      part.parts.forEach(walk);
    }
  };

  walk(payload);

  if (!plain && !html && payload.body?.data) {
    plain = decodeBody(payload.body.data);
  }

  return plain || stripHtml(html);
}

function header(payload: any, name: string): string {
  const h = (payload?.headers ?? []).find(
    (x: any) => String(x.name).toLowerCase() === name.toLowerCase(),
  );
  return h?.value ?? '';
}

function toEmail(msg: any): Email {
  return {
    id: msg.id,
    from: header(msg.payload, 'From'),
    subject: header(msg.payload, 'Subject') || '(no subject)',
    date: header(msg.payload, 'Date'),
    snippet: msg.snippet ?? '',
    body: extractBody(msg.payload),
  };
}

// ---------- Public API ----------
async function gmailFetch(path: string): Promise<any> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Gmail API error (${res.status})`);
  }
  return res.json();
}

export async function fetchInbox(max: number = INBOX_PAGE_SIZE): Promise<Email[]> {
  const list = await gmailFetch(`/messages?maxResults=${max}&labelIds=INBOX`);
  const ids: string[] = (list.messages ?? []).map((m: any) => m.id);

  const emails = await Promise.all(
    ids.map(async id => {
      const msg = await gmailFetch(`/messages/${id}?format=full`);
      return toEmail(msg);
    }),
  );
  return emails;
}

export async function fetchSpamFolder(max: number = INBOX_PAGE_SIZE): Promise<Email[]> {
  const list = await gmailFetch(`/messages?maxResults=${max}&labelIds=SPAM`);
  const ids: string[] = (list.messages ?? []).map((m: any) => m.id);
  return Promise.all(
    ids.map(async id => toEmail(await gmailFetch(`/messages/${id}?format=full`))),
  );
}
