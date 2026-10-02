const request = require('supertest');
const pool = require('../db/pool');

// Bypass auth
jest.mock('../middlewares/authMiddleware', () => (req, res, next) => {
  req.user = { id: 'user-uuid-123', email: 'test@example.com', username: 'testuser' };
  next();
});

// Mock DB pool
jest.mock('../db/pool', () => ({ query: jest.fn() }));

// Mock fs/promises (folderRouter uses it for file cleanup on delete)
jest.mock('fs/promises', () => ({
  unlink: jest.fn().mockResolvedValue(undefined)
}));

const app = require('../app');

describe('Folder Routes', () => {
  afterEach(() => jest.clearAllMocks());

  // ────────────────────────────────────────────────
  // GET /api/folders/root/contents
  // ────────────────────────────────────────────────
  describe('GET /api/folders/root/contents', () => {
    it('returns 200 with folders and files arrays', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: 'folder-1', name: 'Documents' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'file-1', original_name: 'readme.md' }] });

      const res = await request(app).get('/api/folders/root/contents');

      expect(res.statusCode).toBe(200);
      expect(res.body.current_folder_id).toBeNull();
      expect(res.body.folders).toHaveLength(1);
      expect(res.body.files).toHaveLength(1);
    });

    it('returns 500 on DB error', async () => {
      pool.query.mockRejectedValueOnce(new Error('DB crash'));

      const res = await request(app).get('/api/folders/root/contents');

      expect(res.statusCode).toBe(500);
    });
  });

  // ────────────────────────────────────────────────
  // GET /api/folders/:id/contents
  // ────────────────────────────────────────────────
  describe('GET /api/folders/:id/contents', () => {
    it('returns 404 when folder does not exist or is unauthorized', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/folders/nonexistent-id/contents');

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('Folder not found or unauthorized');
    });

    it('returns 200 with nested folder contents', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: 'folder-1' }] }) // ownership check
        .mockResolvedValueOnce({ rows: [] })                    // sub-folders
        .mockResolvedValueOnce({ rows: [] });                   // files

      const res = await request(app).get('/api/folders/folder-1/contents');

      expect(res.statusCode).toBe(200);
      expect(res.body.current_folder_id).toBe('folder-1');
    });
  });

  // ────────────────────────────────────────────────
  // POST /api/folders
  // ────────────────────────────────────────────────
  describe('POST /api/folders', () => {
    it('returns 400 when folder name is missing', async () => {
      const res = await request(app)
        .post('/api/folders')
        .send({});

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Folder name is required');
    });

    it('returns 400 when folder name is blank whitespace', async () => {
      const res = await request(app)
        .post('/api/folders')
        .send({ name: '   ' });

      expect(res.statusCode).toBe(400);
    });

    it('returns 201 with new folder on success', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 'new-folder-uuid', name: 'Photos', parent_id: null, owner_id: 'user-uuid-123' }]
      });

      const res = await request(app)
        .post('/api/folders')
        .send({ name: 'Photos' });

      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe('Photos');
    });
  });

  // ────────────────────────────────────────────────
  // DELETE /api/folders/:id
  // ────────────────────────────────────────────────
  describe('DELETE /api/folders/:id', () => {
    it('returns 404 when folder does not exist or is unauthorized', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).delete('/api/folders/nonexistent-id');

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('Folder not found or unauthorized');
    });

    it('returns 200 and cleans up physical files on success', async () => {
      const fs = require('fs/promises');

      pool.query
        .mockResolvedValueOnce({ rows: [{ id: 'folder-1' }] })              // ownership check
        .mockResolvedValueOnce({ rows: [{ storage_filename: 'file-uuid' }] }) // recursive file list
        .mockResolvedValueOnce({ rows: [] });                                 // DELETE query

      const res = await request(app).delete('/api/folders/folder-1');

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe('Folder deleted successfully');
      expect(fs.unlink).toHaveBeenCalled();
    });
  });
});
