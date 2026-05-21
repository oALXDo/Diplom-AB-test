const crypto = require('crypto');
const https = require('https');

const DEFAULT_ENDPOINT = 'https://storage.yandexcloud.net';
const DEFAULT_REGION = 'ru-central1';
const SERVICE = 's3';

function config() {
  return {
    bucket: process.env.YC_STORAGE_BUCKET,
    region: process.env.YC_STORAGE_REGION || DEFAULT_REGION,
    endpoint: process.env.YC_STORAGE_ENDPOINT || DEFAULT_ENDPOINT,
    accessKeyId: process.env.YC_STORAGE_ACCESS_KEY_ID,
    secretAccessKey: process.env.YC_STORAGE_SECRET_ACCESS_KEY,
    publicBaseUrl: process.env.YC_STORAGE_PUBLIC_BASE_URL,
    acl: process.env.YC_STORAGE_ACL || ''
  };
}

function isConfigured() {
  const storage = config();
  return Boolean(storage.bucket && storage.accessKeyId && storage.secretAccessKey);
}

function encodePathPart(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeObjectPath(value) {
  return String(value).split('/').map(encodePathPart).join('/');
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

function signingKey(secretAccessKey, dateStamp, region) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, SERVICE);
  return hmac(serviceKey, 'aws4_request');
}

function canonicalHeaders(headers) {
  return Object.keys(headers)
    .sort()
    .map((key) => `${key}:${String(headers[key]).trim().replace(/\s+/g, ' ')}`)
    .join('\n') + '\n';
}

function signedHeaders(headers) {
  return Object.keys(headers).sort().join(';');
}

function amzDate(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function publicUrl(key) {
  const storage = config();
  const baseUrl = storage.publicBaseUrl || `${storage.endpoint.replace(/\/$/, '')}/${storage.bucket}`;
  return `${baseUrl.replace(/\/$/, '')}/${encodeObjectPath(key)}`;
}

function uploadObject({ key, body, contentType }) {
  const storage = config();

  if (!isConfigured()) {
    return Promise.reject(new Error('Yandex Object Storage is not configured'));
  }

  const endpoint = new URL(storage.endpoint);
  const date = amzDate();
  const dateStamp = date.slice(0, 8);
  const payloadHash = hash(body);
  const objectPath = `${endpoint.pathname.replace(/\/$/, '')}/${encodePathPart(storage.bucket)}/${encodeObjectPath(key)}`;
  const headers = {
    'cache-control': 'public, max-age=31536000, immutable',
    'content-length': String(body.length),
    'content-type': contentType,
    host: endpoint.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': date
  };

  if (storage.acl) {
    headers['x-amz-acl'] = storage.acl;
  }

  const canonicalRequest = [
    'PUT',
    objectPath,
    '',
    canonicalHeaders(headers),
    signedHeaders(headers),
    payloadHash
  ].join('\n');
  const credentialScope = `${dateStamp}/${storage.region}/${SERVICE}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    date,
    credentialScope,
    hash(canonicalRequest)
  ].join('\n');
  const signature = hmac(signingKey(storage.secretAccessKey, dateStamp, storage.region), stringToSign, 'hex');
  const requestHeaders = {
    ...headers,
    Authorization: `AWS4-HMAC-SHA256 Credential=${storage.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders(headers)}, Signature=${signature}`
  };

  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: endpoint.protocol,
      hostname: endpoint.hostname,
      port: endpoint.port || 443,
      method: 'PUT',
      path: objectPath,
      headers: requestHeaders
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve({ url: publicUrl(key), statusCode: response.statusCode });
          return;
        }
        reject(new Error(`Yandex Object Storage upload failed: ${response.statusCode} ${text}`));
      });
    });

    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

module.exports = {
  isConfigured,
  publicUrl,
  uploadObject
};
