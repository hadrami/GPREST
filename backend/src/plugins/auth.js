// src/plugins/auth.js
import fp from 'fastify-plugin';

async function authPlugin(fastify) {
  // Adds req.jwtVerify() guard
  fastify.decorate('auth', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ message: 'Unauthorized' });
    }
  });

  // Example: block access if mustChangePassword flag is set (optional)
  fastify.decorate('enforcePasswordChange', async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.code(401).send({ message: 'Unauthorized' }); }
    if (req.user?.mustChangePassword && !req.url.startsWith('/auth')) {
      return reply.code(423).send({ message: 'Password change required' });
    }
  });
}

export default fp(authPlugin, { name: 'auth-plugin' });
