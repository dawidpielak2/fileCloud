const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const pool = require('../db/pool');

const router = express.Router();
const UPLOADS_DIR = path.join(__dirname, '../uploads');

// Retrieves the contents of the root directory (folders and files with no parent)
router.get('/root/contents', async (req, res) => {
    try {
        const userId = req.user.id;

        const foldersQuery = `SELECT * FROM folders WHERE owner_id = $1 AND parent_id IS NULL ORDER BY name ASC`;
        const filesQuery = `SELECT id, original_name, mime_type, size_bytes, created_at FROM files WHERE owner_id = $1 AND folder_id IS NULL ORDER BY created_at DESC`;

        const [foldersResult, filesResult] = await Promise.all([
            pool.query(foldersQuery, [userId]),
            pool.query(filesQuery, [userId])
        ]);

        return res.status(200).json({
            current_folder_id: null,
            folders: foldersResult.rows,
            files: filesResult.rows
        });
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Retrieves the contents of a specific subfolder (both nested folders and files)
router.get('/:id/contents', async (req, res) => {
    try {
        const userId = req.user.id;
        const folderId = req.params.id;

        const checkFolder = await pool.query(
            'SELECT id FROM folders WHERE id = $1 AND owner_id = $2',
            [folderId, userId]
        );

        if (checkFolder.rows.length === 0) {
            return res.status(404).json({ error: 'Folder not found or unauthorized' });
        }

        const foldersQuery = `SELECT * FROM folders WHERE owner_id = $1 AND parent_id = $2 ORDER BY name ASC`;
        const filesQuery = `SELECT id, original_name, mime_type, size_bytes, created_at FROM files WHERE owner_id = $1 AND folder_id = $2 ORDER BY created_at DESC`;

        const [foldersResult, filesResult] = await Promise.all([
            pool.query(foldersQuery, [userId, folderId]),
            pool.query(filesQuery, [userId, folderId])
        ]);

        return res.status(200).json({
            current_folder_id: folderId,
            folders: foldersResult.rows,
            files: filesResult.rows
        });
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Creates a new folder inside the specified parent folder or root directory
router.post('/', async (req, res) => {
    try {
        const { name, parent_id } = req.body;
        const userId = req.user.id;

        if (!name || typeof name !== 'string' || name.trim() === '') {
            return res.status(400).json({ error: 'Folder name is required' });
        }

        const queryText = `
      INSERT INTO folders (name, parent_id, owner_id)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
        const values = [name.trim(), parent_id || null, userId];

        const { rows } = await pool.query(queryText, values);
        return res.status(201).json(rows[0]);
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Recursively deletes a folder, its subfolders, and removes all associated physical files from disk
router.delete('/:id', async (req, res) => {
    try {
        const folderId = req.params.id;
        const userId = req.user.id;

        const checkFolder = await pool.query(
            'SELECT id FROM folders WHERE id = $1 AND owner_id = $2',
            [folderId, userId]
        );

        if (checkFolder.rows.length === 0) {
            return res.status(404).json({ error: 'Folder not found or unauthorized' });
        }

        // CTE to find all nested subfolders and their associated files
        const recursiveQuery = `
      WITH RECURSIVE subfolders AS (
        SELECT id FROM folders WHERE id = $1 AND owner_id = $2
        UNION ALL
        SELECT f.id FROM folders f
        INNER JOIN subfolders s ON f.parent_id = s.id
      )
      SELECT storage_filename FROM files 
      WHERE folder_id IN (SELECT id FROM subfolders) AND owner_id = $2;
    `;

        const filesToDelete = await pool.query(recursiveQuery, [folderId, userId]);

        for (const file of filesToDelete.rows) {
            const filePath = path.join(UPLOADS_DIR, file.storage_filename);
            try {
                await fs.unlink(filePath);
            } catch (err) {
                // Best-effort cleanup — ignore if physical file is already missing
            }
        }

        await pool.query(
            'DELETE FROM folders WHERE id = $1 AND owner_id = $2',
            [folderId, userId]
        );

        return res.status(200).json({ message: 'Folder deleted successfully' });
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;