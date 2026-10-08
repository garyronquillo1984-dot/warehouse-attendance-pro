// Prints local anon / service_role API keys (HS256 JWTs) signed with the local secret.
import crypto from 'node:crypto';
const secret = process.env.LS_JWT_SECRET;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (payload) => {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(payload);
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
};
const exp = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600;
const role = process.argv[2] || 'anon';
console.log(sign({ iss: 'supabase-local', role, iat: Math.floor(Date.now() / 1000), exp }));
