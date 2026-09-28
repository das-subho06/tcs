import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../db';
import { config } from '../config';
import { validateBody } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { hashString } from '../utils/crypto';

export const authRouter = Router();

const AuthBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const HandoffCreateSchema = z.object({
  sessionId: z.string().uuid(),
});

const HandoffExchangeSchema = z.object({
  code: z.string().min(10),
});

// Register
authRouter.post('/register', validateBody(AuthBodySchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, passwordHash },
      select: { id: true, email: true, createdAt: true },
    });

    const token = jwt.sign({ userId: user.id, email: user.email }, config.jwtSecret, {
      expiresIn: '7d',
    });

    res.cookie('token', token, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
});

// Login
authRouter.post('/login', validateBody(AuthBodySchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, config.jwtSecret, {
      expiresIn: '7d',
    });

    res.cookie('token', token, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      user: { id: user.id, email: user.email },
      token,
    });
  } catch (err) {
    next(err);
  }
});

// Current User
authRouter.get('/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

// Logout
authRouter.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

// Create Handoff Code (Called by extension before opening app tab)
authRouter.post('/handoff', requireAuth, validateBody(HandoffCreateSchema), async (req, res, next) => {
  try {
    const { sessionId } = req.body;
    const userId = req.user!.id;

    // Verify session belongs to user
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found or unauthorized' });
    }

    // Generate random code
    const rawCode = crypto.randomBytes(24).toString('hex');
    const codeHash = hashString(rawCode);
    const expiresAt = new Date(Date.now() + 60 * 1000); // 60 seconds

    await prisma.handoffCode.create({
      data: {
        codeHash,
        userId,
        sessionId,
        expiresAt,
      },
    });

    res.json({ code: rawCode, expiresAt });
  } catch (err) {
    next(err);
  }
});

// Exchange Handoff Code (Called by frontend on route /sessions/:id/speakers?handoff=<code>)
authRouter.post('/handoff/exchange', validateBody(HandoffExchangeSchema), async (req, res, next) => {
  try {
    const { code } = req.body;
    const codeHash = hashString(code);

    const record = await prisma.handoffCode.findUnique({
      where: { codeHash },
      include: { user: true },
    });

    if (!record) {
      return res.status(400).json({ error: 'Invalid handoff code' });
    }

    if (record.usedAt) {
      return res.status(400).json({ error: 'Handoff code has already been used' });
    }

    if (record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Handoff code has expired' });
    }

    // Mark as used
    await prisma.handoffCode.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    const token = jwt.sign(
      { userId: record.userId, email: record.user.email },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      token,
      user: { id: record.user.id, email: record.user.email },
      sessionId: record.sessionId,
    });
  } catch (err) {
    next(err);
  }
});
