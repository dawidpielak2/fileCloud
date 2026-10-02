const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const client = jwksClient({
    jwksUri: 'http://keycloak:8080/realms/file-cloud/protocol/openid-connect/certs'
});

// Retrieves RSA public key from Keycloak JWKS for JWT signature verification
function getKey(header, callback) {
    client.getSigningKey(header.kid, function (err, key) {
        if (err) {
            return callback(err, null);
        }
        const signingKey = key.publicKey || key.rsaPublicKey;
        callback(null, signingKey);
    });
}

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split(' ')[1];
    console.log("DEBUG: Extracted token:", token);

    jwt.verify(token, getKey, {
        algorithms: ['RS256'],
        issuer: 'http://localhost:8080/realms/file-cloud'
    }, (err, decoded) => {
        if (err) {
            console.error("JWT Verification Error:", err.message);
            return res.status(401).json({ error: 'Unauthorized: Invalid token' });
        }
        req.user = {
            id: decoded.sub,
            email: decoded.email,
            username: decoded.preferred_username
        };
        next();
    });
};

module.exports = authMiddleware;