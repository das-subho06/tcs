import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { generateExcelReport } from '../services/export/excel';
import { notionExportService } from '../services/export/notion';
import { encrypt, decrypt } from '../utils/crypto';
import { config } from '../config';

export const exportRouter = Router();

const NotionExportSchema = z.object({
  parentPageId: z.string().min(1),
});

// GET /api/sessions/:id/export/excel
exportRouter.get('/sessions/:id/export/excel', requireAuth, async (req, res, next) => {
  try {
    const { id: sessionId } = req.params;
    const userId = req.user!.id;

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId },
      include: { actionItems: true },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const rows = session.actionItems.map(item => ({
      done: item.done,
      action: item.action,
      owner: item.owner,
      due: item.dueRaw || (item.dueDate ? item.dueDate.toISOString().split('T')[0] : ''),
      assignedBy: item.assignedBy,
      sourceMeeting: session.title,
    }));

    const excelBuffer = await generateExcelReport(session.title, rows);

    // Record export
    await prisma.export.create({
      data: {
        sessionId,
        type: 'excel',
      },
    });

    // Update status to EXPORTED
    await prisma.session.update({
      where: { id: sessionId },
      data: { status: 'EXPORTED' },
    });

    const safeTitle = session.title.replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Action_Items_${safeTitle}.xlsx"`);
    res.send(excelBuffer);
  } catch (err) {
    next(err);
  }
});

// GET /api/integrations/notion/status
exportRouter.get('/integrations/notion/status', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const integration = await prisma.integration.findUnique({
      where: { userId_provider: { userId, provider: 'notion' } },
    });

    res.json({
      connected: !!integration,
      workspaceName: integration?.workspaceName || null,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/integrations/notion/pages
exportRouter.get('/integrations/notion/pages', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const integration = await prisma.integration.findUnique({
      where: { userId_provider: { userId, provider: 'notion' } },
    });

    if (!integration) {
      return res.status(400).json({ error: 'Notion is not connected' });
    }

    const token = decrypt(integration.encryptedToken);
    const pages = await notionExportService.fetchSearchPages(token);
    res.json({ pages });
  } catch (err: any) {
    if (err.message && err.message.includes('expired or revoked')) {
      return res.status(401).json({ error: err.message });
    }
    next(err);
  }
});

// GET /api/integrations/notion/auth
exportRouter.get('/integrations/notion/auth', requireAuth, async (req, res) => {
  const clientId = config.notion.clientId;
  const redirectUri = encodeURIComponent(config.notion.redirectUri);
  const state = req.user!.id; // state token carrying user id

  if (!clientId) {
    return res.status(400).json({
      error: 'Notion integration is not configured. Set NOTION_CLIENT_ID and NOTION_CLIENT_SECRET.',
    });
  }

  const authUrl = `https://api.notion.com/v1/oauth/authorize?owner=user&client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&state=${state}`;
  res.json({ authUrl });
});

// GET /api/integrations/notion/callback (OAuth redirect target)
exportRouter.get('/integrations/notion/callback', async (req, res, next) => {
  try {
    const { code, state: userId, error } = req.query;

    if (error || !code) {
      return res.redirect(`${config.appUrl}?notion_error=${encodeURIComponent(String(error || 'cancelled'))}`);
    }

    const { accessToken, workspaceId, workspaceName } = await notionExportService.exchangeCodeForToken(String(code));
    const encryptedToken = encrypt(accessToken);

    await prisma.integration.upsert({
      where: { userId_provider: { userId: String(userId), provider: 'notion' } },
      create: {
        userId: String(userId),
        provider: 'notion',
        encryptedToken,
        workspaceId,
        workspaceName,
      },
      update: {
        encryptedToken,
        workspaceId,
        workspaceName,
      },
    });

    res.redirect(`${config.appUrl}?notion_connected=true`);
  } catch (err) {
    next(err);
  }
});

// POST /api/sessions/:id/export/notion
exportRouter.post(
  '/sessions/:id/export/notion',
  requireAuth,
  validateBody(NotionExportSchema),
  async (req, res, next) => {
    try {
      const { id: sessionId } = req.params;
      const { parentPageId } = req.body;
      const userId = req.user!.id;

      const session = await prisma.session.findFirst({
        where: { id: sessionId, userId },
        include: { actionItems: true },
      });

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const integration = await prisma.integration.findUnique({
        where: { userId_provider: { userId, provider: 'notion' } },
      });

      if (!integration) {
        return res.status(400).json({ error: 'Notion is not connected. Please connect Notion in settings.' });
      }

      const token = decrypt(integration.encryptedToken);
      const createdPageId = await notionExportService.exportActionItems(
        token,
        parentPageId,
        session.title,
        session.meetingDate,
        session.actionItems
      );

      // Record export
      await prisma.export.create({
        data: {
          sessionId,
          type: 'notion',
          externalId: createdPageId,
        },
      });

      // Update session status to EXPORTED
      await prisma.session.update({
        where: { id: sessionId },
        data: { status: 'EXPORTED' },
      });

      res.json({
        message: 'Successfully exported to Notion',
        pageId: createdPageId,
      });
    } catch (err: any) {
      if (err.message && err.message.includes('expired or revoked')) {
        return res.status(401).json({ error: err.message });
      }
      next(err);
    }
  }
);
