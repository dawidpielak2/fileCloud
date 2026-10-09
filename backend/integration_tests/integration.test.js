const request = require('supertest');

// Use the URL from the environment, or default to localhost if testing locally
const targetUrl = process.env.TEST_TARGET_URL || 'http://localhost:5000';

describe('Integration Tests for file-cloud API', () => {

    describe('GET /api/health', () => {
        it('should return 200 and confirm database connection', async () => {
            const response = await request(targetUrl).get('/api/health');
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('status', 'ok');
            expect(response.body).toHaveProperty('time');
        });
    });

    describe('GET /api/auth/me', () => {
        it('should block unauthenticated requests', async () => {
            const response = await request(targetUrl).get('/api/auth/me');
            expect(response.status).toBe(401);
        });
    });
 
    describe('Malformed JSON body', () => {
        it('should gracefully handle malformed JSON requests', async () => {
            const response = await request(targetUrl)
                .post('/api/folders') 
                .set('Content-Type', 'application/json')
                .send('{"bad_json": '); 
            
            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('status', 'error');
            expect(response.body).toHaveProperty('message', 'Bad JSON format');
        });
    });
});
