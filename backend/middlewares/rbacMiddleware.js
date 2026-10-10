const requireRole = (requiredRole) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized: User not authenticated' });
        }

        if (!req.user.roles || !req.user.roles.includes(requiredRole)) {
            return res.status(403).json({ error: `Forbidden: Requires '${requiredRole}' role` });
        }

        next();
    };
};

module.exports = requireRole;
