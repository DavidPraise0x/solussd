// SolUSSD — Session Manager for USSD sessions
const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

const sessions = new Map();

/**
 * Create a new USSD session
 */
function createSession(sessionId, phoneNumber) {
    const session = {
        phone: phoneNumber,
        state: 'WELCOME',
        data: {},
        createdAt: Date.now(),
        lastActivity: Date.now(),
    };
    sessions.set(sessionId, session);
    return session;
}

/**
 * Get an active session (returns null if expired)
 */
function getSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return null;

    if (Date.now() - session.lastActivity > SESSION_TIMEOUT) {
        sessions.delete(sessionId);
        return null;
    }

    session.lastActivity = Date.now();
    return session;
}

/**
 * Update session data
 */
function updateSession(sessionId, updates) {
    const session = sessions.get(sessionId);
    if (!session) return null;
    Object.assign(session, updates);
    session.lastActivity = Date.now();
    return session;
}

/**
 * Delete a session
 */
function deleteSession(sessionId) {
    sessions.delete(sessionId);
}

/**
 * Clean up expired sessions
 */
function cleanExpired() {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, session] of sessions) {
        if (now - session.lastActivity > SESSION_TIMEOUT) {
            sessions.delete(id);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        console.log(`  🧹 Cleaned ${cleaned} expired session(s)`);
    }
}

// Auto-clean every 60 seconds
setInterval(cleanExpired, 60 * 1000);

module.exports = { createSession, getSession, updateSession, deleteSession };
