const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const pool = require('./db/pool');
const authMiddleware = require('./middlewares/authMiddleware');
const folderRouter = require('./routers/folderRouter');
const filesRouter = require('./routers/filesRouter');
const helmet = require('helmet'); 

const app = express();

app.use(cors());
app.use(express.json());
app.use(helmet());

// Audit Logging: Logs every incoming request and response status
app.use(morgan(':date[iso] | :remote-addr | :method :url | Status: :status | Response Time: :response-time ms'));

// Rate Limiting & Brute Force Prevention
const apiLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { status: 'error', message: 'Too many requests from this IP, please  try again after a while' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// Verifies database connection status
app.get('/api/health', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT NOW()');
        res.status(200).json({ status: 'ok', time: rows[0].now });
    } catch (error) {
        res.status(503).json({ status: 'error', message: 'database connection failed' });
    }
});

// Verifies JWT token and returns authenticated user details
app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.status(200).json({
        status: 'ok',
        message: 'authenticated successfully',
        user: req.user
    });
});

app.use('/api/folders', authMiddleware, folderRouter);
app.use('/api/files', authMiddleware, filesRouter);

// Global error handler to gracefully catch malformed JSON requests (e.g. from ghost probes)
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        console.warn('Caught malformed JSON request:', err.message);
        return res.status(400).json({ status: 'error', message: 'Bad JSON format' });
    }
    next(err);
});

module.exports = app;
