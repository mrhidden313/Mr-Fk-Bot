const VPS_BASE = 'https://162.35.171.126.nip.io';

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, request }) {
    return proxy(params.path, 'GET', request, null);
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ params, request }) {
    const body = await request.text();
    return proxy(params.path, 'POST', request, body);
}

/** @type {import('./$types').RequestHandler} */
export async function PUT({ params, request }) {
    const body = await request.text();
    return proxy(params.path, 'PUT', request, body);
}

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ params, request }) {
    return proxy(params.path, 'DELETE', request, null);
}

/** @type {import('./$types').RequestHandler} */
export async function OPTIONS({ params, request }) {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-token'
        }
    });
}

async function proxy(path, method, request, body) {
    const url = `${VPS_BASE}/api/${path}`;

    const headers = {};
    const contentType = request.headers.get('content-type');
    const auth = request.headers.get('authorization');
    const adminToken = request.headers.get('x-admin-token');

    if (contentType) headers['content-type'] = contentType;
    if (auth) headers['authorization'] = auth;
    if (adminToken) headers['x-admin-token'] = adminToken;

    try {
        const res = await fetch(url, {
            method,
            headers,
            body: body || undefined
        });

        return new Response(res.body, {
            status: res.status,
            headers: {
                'content-type': res.headers.get('content-type') || 'application/json',
                'cache-control': res.headers.get('cache-control') || 'no-cache',
                'access-control-allow-origin': '*'
            }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: 'Proxy error: ' + err.message }), {
            status: 502,
            headers: { 'content-type': 'application/json' }
        });
    }
}
