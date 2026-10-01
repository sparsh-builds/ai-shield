import {Buffer} from 'buffer';
import {clearAccessToken, getAccessToken} from './auth';
import {EmailFull, EmailSummary} from './types';

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

async function gmailGet(path: string, retry = true): Promise<any> {
  const token = await getAccessToken();
  const r = await fetch(`${BASE}${path}`, {
    headers: {Authorization: `Bearer ${token}`},
  });
  if (r.status === 401 && retry) {
    await clearAccessToken(token); // token expired -> get a fresh one
    return gmailGet(path, false);
  }
  if (r.status === 403) {
    throw new Error(
      'Gmail access denied (403). Enable Gmail API in Google Cloud and grant the Gmail permission.',
    );
  }
  if (!r.ok) throw new Error(`Gmail API error ${r.status}`);
  return r.json();
}

const header = (m: any, name: string): string =>
  m.payload?.headers?.find(
    (h: any) => h.name?.toLowerCase() === name.toLowerCase(),
  )?.value ?? '';

export async function listInbox(max = 20): Promise<EmailSummary[]> {
  const list = await gmailGet(`/messages?maxResults=${max}&labelIds=INBOX`);
  const ids: {id: string}[] = list.messages ?? [];
  return Promise.all(
    ids.map(async ({id}) => {
      const m = await gmailGet(
        `/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
      );
      return {
        id,
        threadId: m.threadId,
        subject: header(m, 'Subject') || '(no subject)',
        from: header(m, 'From'),
        date: header(m, 'Date'),
        snippet: m.snippet ?? '',
      };
    }),
  );
}

function decode(data?: string): string {
  if (!data) return '';
  return Buffer.from(
    data.replace(/-/g, '+').replace(/_/g, '/'),
    'base64',
  ).toString('utf-8');
}

function collect(part: any, out: {plain: string; html: string}) {
  if (!part) return;
  if (part.mimeType === 'text/plain' && part.body?.data) {
    out.plain += decode(part.body.data);
  } else if (part.mimeType === 'text/html' && part.body?.data) {
    out.html += decode(part.body.data);
  }
  (part.parts ?? []).forEach((p: any) => collect(p, out));
}

function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
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

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

export function extractUrls(plain: string, html: string): string[] {
  const found = new Set<string>();
  const add = (u: string) => found.add(u.replace(/[.,;:!?]+$/, ''));
  (plain.match(URL_RE) ?? []).forEach(add);
  // links hidden behind button/anchor text only exist in the HTML
  const hrefRe = /href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    if (/^https?:\/\//i.test(m[1])) add(m[1]);
  }
  return Array.from(found);
}

export async function getEmail(id: string): Promise<EmailFull> {
  const m = await gmailGet(`/messages/${id}?format=full`);
  const out = {plain: '', html: ''};
  collect(m.payload, out);
  const body = (out.plain || htmlToText(out.html)).trim();
  return {
    id,
    threadId: m.threadId,
    subject: header(m, 'Subject') || '(no subject)',
    from: header(m, 'From'),
    date: header(m, 'Date'),
    snippet: m.snippet ?? '',
    body,
    urls: extractUrls(out.plain, out.html),
  };
}
