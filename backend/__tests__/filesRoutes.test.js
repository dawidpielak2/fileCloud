const request = require('supertest');
const fs = require('fs/promises');
const pool = require('../db/pool');

// Bypass auth for all file route tests 
jest.mock('../middlewares/authMiddleware', () => (req, res, next) => {
  req.user = { id: 'user-uuid-123', email: 'test@example.com', username: 'testuser' };
  next();
});

// Mock DB pool
jest.mock('../db/pool', () => ({ query: jest.fn() }));

// Mock fs/promises to avoid hitting the real filesystem
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
  access: jest.fn().mockResolvedValue(undefined)
}));

// Mock multer so we can control req.file without a real upload
jest.mock('multer', () => {
  const multerMock = () => ({
    single: () => (req, res, next) => {
      req.file = req.headers['x-mock-file']
        ? {
            originalname: 'test.pdf',
            filename: 'uuid-stored-name',
            mimetype: 'application/pdf',
            size: 1024,
            path: '/tmp/uuid-stored-name'
          }
        : undefined;
      next();
    }
  });
  multerMock.diskStorage = jest.fn(() => ({}));
  return multerMock;
});

const app = require('../app');

describe('File Routes', () => {
  afterEach(() => jest.clearAllMocks());

  // ────────────────────────────────────────────────
  // POST /api/files
  // ────────────────────────────────────────────────
  describe('POST /api/files', () => {
    it('returns 400 when no file is provided', async () => {
      const res = await request(app).post('/api/files');
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('No file uploaded');
    });

    it('returns 201 with file metadata on successful upload (no folder)', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 'file-uuid',
          original_name: 'test.pdf',
          mime_type: 'application/pdf',
          size_bytes: 1024,
          folder_id: null,
          created_at: new Date().toISOString()
        }]
      });

      const res = await request(app)
        .post('/api/files')
        .set('x-mock-file', 'true'); // triggers multer mock to set req.file

      expect(res.statusCode).toBe(201);
      expect(res.body.original_name).toBe('test.pdf');
    });

    it('returns 400 when folder_id does not belong to the user', async () => {
      // folder ownership check returns empty rows
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/files')
        .set('x-mock-file', 'true')
        .send({ folder_id: 'nonexistent-folder' });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/Folder does not exist/);
    });

    it('returns 500 on unexpected DB error', async () => {
      pool.query.mockRejectedValueOnce(new Error('DB crash'));

      const res = await request(app)
        .post('/api/files')
        .set('x-mock-file', 'true');

      expect(res.statusCode).toBe(500);
    });
  });

  // ────────────────────────────────────────────────
  // GET /api/files/:id/download
  // ────────────────────────────────────────────────
  describe('GET /api/files/:id/download', () => {
    it('returns 404 when file is not found or unauthorized', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/files/nonexistent-id/download');

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('File not found or unauthorized');
    });

    it('returns 404 when physical file is missing from disk', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ original_name: 'test.pdf', storage_filename: 'uuid-stored-name' }]
      });
      fs.access.mockRejectedValueOnce(new Error('ENOENT'));

      const res = await request(app).get('/api/files/file-uuid/download');

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('Physical file missing');
    });
  });

  // ────────────────────────────────────────────────
  // DELETE /api/files/:id
  // ────────────────────────────────────────────────
  describe('DELETE /api/files/:id', () => {
    it('returns 404 when file is not found or unauthorized', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).delete('/api/files/nonexistent-id');

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('File not found or unauthorized');
    });

    it('returns 200 and deletes file successfully', async () => {
      // SELECT query returns a row
      pool.query
        .mockResolvedValueOnce({ rows: [{ storage_filename: 'uuid-stored-name' }] })
        .mockResolvedValueOnce({ rows: [] }); // DELETE query

      const res = await request(app).delete('/api/files/file-uuid');

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe('File deleted successfully');
      expect(fs.unlink).toHaveBeenCalled();
    });

    it('returns 500 on unexpected DB error', async () => {
      pool.query.mockRejectedValueOnce(new Error('DB crash'));

      const res = await request(app).delete('/api/files/file-uuid');

      expect(res.statusCode).toBe(500);
    });
  });
});
