const authMiddleware = require('../middlewares/authMiddleware');
const jwt = require('jsonwebtoken');

// Mock external dependencies
jest.mock('jsonwebtoken');
jest.mock('jwks-rsa', () => {
  return jest.fn().mockReturnValue({
    getSigningKey: jest.fn()
  });
});

describe('authMiddleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('returns 401 when Authorization header is missing', () => {
    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized: No token provided' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header does not start with Bearer', () => {
    req.headers.authorization = 'Basic sometoken';

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized: No token provided' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when JWT verification fails', (done) => {
    req.headers.authorization = 'Bearer invalid.token.here';

    jwt.verify.mockImplementation((token, getKey, options, callback) => {
      callback(new Error('invalid signature'), null);
    });

    authMiddleware(req, res, next);

    setImmediate(() => {
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized: Invalid token' });
      expect(next).not.toHaveBeenCalled();
      done();
    });
  });

  it('sets req.user and calls next() when JWT is valid', (done) => {
    req.headers.authorization = 'Bearer valid.token.here';

    const decodedPayload = {
      sub: 'user-uuid-123',
      email: 'test@example.com',
      preferred_username: 'testuser'
    };

    jwt.verify.mockImplementation((token, getKey, options, callback) => {
      callback(null, decodedPayload);
    });

    authMiddleware(req, res, next);

    setImmediate(() => {
      expect(next).toHaveBeenCalled();
      expect(req.user).toEqual({
        id: 'user-uuid-123',
        email: 'test@example.com',
        username: 'testuser'
      });
      done();
    });
  });
});
