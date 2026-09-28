import { ActionItem } from '@prisma/client';
import { config } from '../../config';

export class NotionExportService {
  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async exchangeCodeForToken(code: string): Promise<{ accessToken: string; workspaceId: string; workspaceName?: string }> {
    const clientId = config.notion.clientId;
    const clientSecret = config.notion.clientSecret;
    const redirectUri = config.notion.redirectUri;

    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const res = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${authHeader}`,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to exchange Notion token: ${err}`);
    }

    const data = await res.json() as any;
    return {
      accessToken: data.access_token,
      workspaceId: data.workspace_id,
      workspaceName: data.workspace_name,
    };
  }

  async fetchSearchPages(token: string): Promise<Array<{ id: string; title: string }>> {
    const res = await this.notionRequest('https://api.notion.com/v1/search', token, {
      method: 'POST',
      body: JSON.stringify({
        filter: { value: 'page', property: 'object' },
        page_size: 20,
      }),
    });

    const data = await res.json() as any;
    return (data.results || []).map((p: any) => {
      let title = 'Untitled Page';
      if (p.properties && p.properties.title && p.properties.title.title?.[0]?.plain_text) {
        title = p.properties.title.title[0].plain_text;
      }
      return { id: p.id, title };
    });
  }

  async exportActionItems(
    token: string,
    parentPageId: string,
    meetingTitle: string,
    meetingDate: Date,
    actionItems: ActionItem[]
  ): Promise<string> {
    const dateFormatted = meetingDate.toISOString().split('T')[0];
    const pageTitle = `Action Items - ${meetingTitle || 'Meeting'} (${dateFormatted})`;

    // 1. Create the page under parentPageId
    const createPageRes = await this.notionRequest('https://api.notion.com/v1/pages', token, {
      method: 'POST',
      body: JSON.stringify({
        parent: { page_id: parentPageId },
        properties: {
          title: {
            title: [{ text: { content: pageTitle } }],
          },
        },
      }),
    });

    const createdPage = await createPageRes.json() as any;
    const pageId = createdPage.id;

    // 2. Prepare to_do blocks
    // Format: "<Action> - Owner: X - Due: Y - Assigned by: Z"
    const blocks = actionItems.map(item => {
      const textContent = `${item.action} - Owner: ${item.owner} - Due: ${item.dueRaw || (item.dueDate ? item.dueDate.toISOString().split('T')[0] : 'None')} - Assigned by: ${item.assignedBy}`;
      return {
        object: 'block',
        type: 'to_do',
        to_do: {
          rich_text: [{ type: 'text', text: { content: textContent } }],
          checked: item.done,
        },
      };
    });

    // Notion limit: 100 blocks per request
    const CHUNK_SIZE = 100;
    for (let i = 0; i < blocks.length; i += CHUNK_SIZE) {
      const chunk = blocks.slice(i, i + CHUNK_SIZE);
      await this.notionRequest(`https://api.notion.com/v1/blocks/${pageId}/children`, token, {
        method: 'PATCH',
        body: JSON.stringify({ children: chunk }),
      });
      // Rate limit throttling ~3 req/s
      await this.sleep(350);
    }

    return pageId;
  }

  private async notionRequest(
    url: string,
    token: string,
    options: RequestInit,
    retryCount: number = 0
  ): Promise<Response> {
    const headers = {
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    };

    const res = await fetch(url, { ...options, headers });

    if (res.status === 429) {
      const retryAfterHeader = res.headers.get('Retry-After');
      const waitSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 2;
      if (retryCount < 3) {
        console.warn(`Notion 429 rate limit hit. Waiting ${waitSeconds}s before retry...`);
        await this.sleep(waitSeconds * 1000);
        return this.notionRequest(url, token, options, retryCount + 1);
      }
    }

    if (res.status === 401 || res.status === 403) {
      throw new Error('Notion authorization expired or revoked. Please reconnect your Notion account.');
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Notion API error (${res.status}): ${errText}`);
    }

    return res;
  }
}

export const notionExportService = new NotionExportService();
