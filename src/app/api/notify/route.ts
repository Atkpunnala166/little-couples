import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64UrlEncode(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    })
  );

  const unsigned = `${header}.${claim}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsigned);
  const signature = base64UrlEncode(sign.sign(sa.private_key));
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    throw new Error(`OAuth token exchange failed: ${res.status}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      token?: string;
      title?: string;
      message?: string;
      data?: Record<string, string>;
    };

    if (!body.token || !body.title) {
      return NextResponse.json({ sent: false, reason: 'Missing token or title' }, { status: 400 });
    }

    const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!saJson || saJson.trim() === '') {
      return NextResponse.json({
        sent: false,
        reason: 'FIREBASE_SERVICE_ACCOUNT_JSON not configured',
      });
    }

    const sa = JSON.parse(saJson) as ServiceAccount;
    const accessToken = await getAccessToken(sa);

    const fcmRes = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: body.token,
            notification: {
              title: body.title,
              body: body.message || '',
            },
            data: body.data || {},
            webpush: {
              fcm_options: {
                link: '/',
              },
              notification: {
                icon: '/icons/icon-192.svg',
                badge: '/icons/icon-192.svg',
              },
            },
          },
        }),
      }
    );

    if (!fcmRes.ok) {
      const errText = await fcmRes.text();
      return NextResponse.json({ sent: false, error: errText }, { status: 500 });
    }

    return NextResponse.json({ sent: true });
  } catch (err) {
    return NextResponse.json(
      { sent: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

