const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');

// Mock the entire DB pool module
jest.mock('../db/pool', () => ({
  query: jest.fn()
}));

describe('GET /api/health', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with status ok when database is reachable', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ now: '2024-01-01T00:00:00Z' }] });

    const res = await request(app).get('/api/health');

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.time).toBeDefined();
  });

  it('returns 503 when database query fails', async () => {
    pool.query.mockRejectedValueOnce(new Error('Connection refused'));

    const res = await request(app).get('/api/health');

    expect(res.statusCode).toBe(503);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toBe('database connection failed');
  });
});
