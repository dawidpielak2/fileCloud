const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs/promises');
const pool = require('../db/pool');

const router = express.Router();
const UPLOADS_DIR = path.join(__dirname, '../uploads');

// Configures local disk storage and ensures upload directory exists
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        try {
            await fs.mkdir(UPLOADS_DIR, { recursive: true });
            cb(null, UPLOADS_DIR);
        } catch (err) {
            cb(err, UPLOADS_DIR);
        }
    },
    filename: (req, file, cb) => {
        cb(null, uuidv4());
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Uploads a physical file to the disk and saves its metadata to the database
router.post('/', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = req.user.id;
    const folderId = req.body.folder_id || null;
    const { originalname, filename, mimetype, size, path: tempPath } = req.file;

    try {
        if (folderId) {
            const { rows } = await pool.query(
                'SELECT id FROM folders WHERE id = $1 AND owner_id = $2',
                [folderId, userId]
            );

            if (rows.length === 0) {
                await fs.unlink(tempPath);
                return res.status(400).json({ error: 'Folder does not exist or unauthorized' });
            }
        }

        const queryText = `
      INSERT INTO files (original_name, storage_filename, mime_type, size_bytes, folder_id, owner_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, original_name, mime_type, size_bytes, folder_id, created_at
    `;
        const queryValues = [originalname, filename, mimetype, size, folderId, userId];

        const { rows } = await pool.query(queryText, queryValues);
        return res.status(201).json(rows[0]);
    } catch (error) {
        await fs.unlink(tempPath).catch(() => { });
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Streams the physical file from the disk to the client for downloading
router.get('/:id/download', async (req, res) => {
    try {
        const fileId = req.params.id;
        const userId = req.user.id;

        const { rows } = await pool.query(
            'SELECT original_name, storage_filename FROM files WHERE id = $1 AND owner_id = $2',
            [fileId, userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'File not found or unauthorized' });
        }

        const file = rows[0];
        const physicalPath = path.join(UPLOADS_DIR, file.storage_filename);

        try {
            await fs.access(physicalPath);
        } catch {
            return res.status(404).json({ error: 'Physical file missing' });
        }

        return res.download(physicalPath, file.original_name);
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Removes a file's metadata from the database and deletes the physical file from the disk
router.delete('/:id', async (req, res) => {
    try {
        const fileId = req.params.id;
        const userId = req.user.id;

        const { rows } = await pool.query(
            'SELECT storage_filename FROM files WHERE id = $1 AND owner_id = $2',
            [fileId, userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'File not found or unauthorized' });
        }

        const storageFilename = rows[0].storage_filename;

        await pool.query(
            'DELETE FROM files WHERE id = $1 AND owner_id = $2',
            [fileId, userId]
        );

        const physicalFilePath = path.join(UPLOADS_DIR, storageFilename);

        try {
            await fs.unlink(physicalFilePath);
        } catch (fsError) {
            // Best-effort cleanup — ignore if physical file is already missing
        }

        return res.status(200).json({ message: 'File deleted successfully' });
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;