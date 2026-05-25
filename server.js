const express = require('express');
const crypto = require('crypto');
const path = require('path');
const https = require('https');

const app = express();
const PORT = 3000;

// The actual target URLs (Completely hidden on the backend)
const VIDEO_URL = 'https://www.dropbox.com/scl/fi/u2rov6fptm26f96wc3z4a/CINEFREAK.TOP-Bonolota-Express-2026-WEB-DL-Bengali-HoiChoi-1080p-ESub.mkv?rlkey=t6djaza8fmqzuz6q1t8vu5sut&raw=1';
const POSTER_URL = 'https://uc60324aae68ce8bd3b63af6bd12.previews.dropboxusercontent.com/p/thumb/ADBYc6A9iH6qoWj5KKbeBLnFYKJQ3fjz9B9lUQyAW9bIN8cpCv-yXY4MUti14p0Gr62GkeSIjH4QnYsYJgB2-YbR5T8M2udzhCZw4AQHJ9ZB6o3xNMiRVQ_tVmtMui1cJ2AqXlXmzQ-2IpCVx9SDKGhXLS9z-jgwMM7dm8Rsah8n1XEpoLyOTfVI3sJrIa7ATT2-gl9QgIWq_FiwcoMcQgvDQuu0_2ceN-T8c3b-QDgcvR42c4srBdEMySOZVlBc2FZRUGeMeLjNGnRh0qdJKQyFhRMUz82H6QBxjgn33C4pOUPA_ZpbVK3NGj-iOTtKwxL1Fh61-HP9_q8DMUqExxtbqIE7oppMcYzZXAKmVBYcENFkP0nqJwl6mYUrOiPKS3w/p.png?is_prewarmed=true';
const QUALITY_AUTO_URL = 'https://www.dropbox.com/scl/fi/u2rov6fptm26f96wc3z4a/Bonolota-Express-2026-1080p.mkv?rlkey=t6djaza8fmqzuz6q1t8vu5sut&raw=1';

const validTokens = new Map();

// 1. Generate Token
app.post('/api/token', (req, res) => {
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + 2 * 60 * 60 * 1000; // 2 hours expiry
    
    // BIND TOKEN TO IP AND USER-AGENT (Blocks sharing to external tools/servers)
    const clientIp = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    validTokens.set(token, { expiresAt, ip: clientIp, userAgent });
    res.json({ token });
});

// 2. Strict Verification (Facebook / Google Level Origin Protection)
function verifyToken(req, res, next) {
    // -----------------------------------------------------------------------
    // INDUSTRY STANDARD: SEC-FETCH METADATA VALIDATION
    // This strictly blocks Internet Download Manager (IDM), cURL, and direct 
    // link sharing. The browser automatically sends these headers, but external 
    // tools or direct URL pasting do not.
    // -----------------------------------------------------------------------
    const fetchDest = req.headers['sec-fetch-dest'];
    const fetchSite = req.headers['sec-fetch-site'];
    
    // Only allow legitimate requests or internal fetches.
    // 'image' is required for the poster/thumbnail.
    if (fetchDest !== 'video' && fetchDest !== 'empty' && fetchDest !== 'image') {
        console.log(`Blocked non-video access attempt. Dest: ${fetchDest}`);
        return res.status(403).send('Direct access strictly forbidden.');
    }
    // Only allow requests originating from your own website
    if (fetchSite !== 'same-origin') {
        console.log('Blocked cross-origin access attempt.');
        return res.status(403).send('Cross-origin requests forbidden.');
    }

    // Validate the session token
    const token = req.query.t;
    if (!token || !validTokens.has(token)) {
        return res.status(403).send('Invalid or expired session.');
    }
    
    // IP AND USER-AGENT VALIDATION
    const tokenData = validTokens.get(token);
    const currentIp = req.ip || req.socket.remoteAddress;
    const currentUserAgent = req.headers['user-agent'] || 'unknown';
    
    if (tokenData.ip !== currentIp || tokenData.userAgent !== currentUserAgent) {
        console.log(`Blocked token theft attempt! Expected IP: ${tokenData.ip}, Got: ${currentIp}`);
        return res.status(403).send('Session mismatch. Token cannot be used externally.');
    }
    
    next();
}

// 3. Streaming Proxy (Keeps the Dropbox URL completely off the client)
function proxyRequest(req, res, targetUrl) {
    const urlObj = new URL(targetUrl);
    const headers = { ...req.headers };
    
    // Clean headers before sending to Dropbox to prevent signature mismatches
    delete headers.host;
    delete headers.cookie;
    delete headers.referer;
    
    const options = { headers: { ...headers, host: urlObj.host } };
    
    const proxyReq = https.get(targetUrl, options, (proxyRes) => {
        // Automatically follow Dropbox redirects natively on the server side
        if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
            return proxyRequest(req, res, proxyRes.headers.location);
        }
        
        const resHeaders = { ...proxyRes.headers };
        // Remove CORS headers so no other website can request this stream
        delete resHeaders['access-control-allow-origin'];
        
        // Anti-IDM: Remove content disposition and change content type 
        // to prevent IDM from recognizing it as a downloadable media file.
        delete resHeaders['content-disposition'];
        resHeaders['content-type'] = 'application/octet-stream';
        
        res.writeHead(proxyRes.statusCode, resHeaders);
        proxyRes.pipe(res); // Stream directly to client
    }).on('error', (err) => {
        console.error('Proxy Error:', err.message);
        if (!res.headersSent) res.status(500).send('Proxy Error');
    });
    
    // Pipe the client's request (including Range requests for seeking) to Dropbox
    req.pipe(proxyReq);
}

// Attach strict middleware to all media endpoints
app.get('/api/video', verifyToken, (req, res) => proxyRequest(req, res, VIDEO_URL));
app.get('/api/poster', verifyToken, (req, res) => proxyRequest(req, res, POSTER_URL));
app.get('/api/video/auto', verifyToken, (req, res) => proxyRequest(req, res, QUALITY_AUTO_URL));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'New Text Document.html'));
});

// Serve Service Worker
app.get('/sw.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'sw.js'));
});

// Cleanup expired tokens
setInterval(() => {
    const now = Date.now();
    for (const [token, data] of validTokens.entries()) {
        if (now > data.expiresAt) validTokens.delete(token);
    }
}, 60000);

app.listen(PORT, () => {
    console.log(`🚀 Secure streaming proxy running at http://localhost:${PORT}`);
});
