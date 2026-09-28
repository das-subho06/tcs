import { Session, Speaker, TranscriptSegment, ActionItem, User } from './types';

const API_BASE = '/api';

let authToken: string | null = localStorage.getItem('token');

export function setToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem('token', token);
  } else {
    localStorage.removeItem('token');
  }
}

export function getToken(): string | null {
  return authToken;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMsg = `Request failed: ${response.statusText}`;
    try {
      const data = await response.json();
      if (data.error) errorMsg = data.error;
    } catch (e) {
      // ignore JSON parse error
    }
    throw new Error(errorMsg);
  }

  return response.json();
}

export const api = {
  // Auth
  async register(email: string, password: string): Promise<{ user: User; token: string }> {
    const res = await request<{ user: User; token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(res.token);
    return res;
  },

  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    const res = await request<{ user: User; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(res.token);
    return res;
  },

  async logout(): Promise<void> {
    try {
      await request('/auth/logout', { method: 'POST' });
    } finally {
      setToken(null);
    }
  },

  async getMe(): Promise<{ user: User }> {
    return request<{ user: User }>('/auth/me');
  },

  async exchangeHandoff(code: string): Promise<{ token: string; user: User; sessionId: string }> {
    const res = await request<{ token: string; user: User; sessionId: string }>('/auth/handoff/exchange', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    setToken(res.token);
    return res;
  },

  // Sessions
  async listSessions(): Promise<Session[]> {
    return request<Session[]>('/sessions');
  },

  async getSession(id: string): Promise<Session & { speakers: Speaker[]; actionItems: ActionItem[] }> {
    return request<any>(`/sessions/${id}`);
  },

  async getSessionStatus(id: string): Promise<{
    id: string;
    status: Session['status'];
    partial: boolean;
    error: string | null;
    retryableStep: string | null;
  }> {
    return request<any>(`/sessions/${id}/status`);
  },

  async retrySession(id: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/sessions/${id}/retry`, { method: 'POST' });
  },

  // Speakers & Clips
  async getSpeakers(sessionId: string): Promise<{ sessionId: string; status: string; speakers: Speaker[] }> {
    return request<any>(`/sessions/${sessionId}/speakers`);
  },

  async updateSpeakers(
    sessionId: string,
    speakers: Array<{ label: string; displayName: string; mergeInto?: string; skip?: boolean }>
  ): Promise<{ message: string }> {
    return request<{ message: string }>(`/sessions/${sessionId}/speakers`, {
      method: 'POST',
      body: JSON.stringify({ speakers }),
    });
  },

  // Transcript
  async getTranscript(sessionId: string): Promise<TranscriptSegment[]> {
    return request<TranscriptSegment[]>(`/sessions/${sessionId}/transcript`);
  },

  // Action Items CRUD
  async getActionItems(sessionId: string): Promise<{ actionItems: ActionItem[]; speakers: string[] }> {
    return request<any>(`/sessions/${sessionId}/actions`);
  },

  async createActionItem(sessionId: string, item: Partial<ActionItem>): Promise<ActionItem> {
    return request<ActionItem>(`/sessions/${sessionId}/actions`, {
      method: 'POST',
      body: JSON.stringify(item),
    });
  },

  async updateActionItem(sessionId: string, actionId: string, item: Partial<ActionItem>): Promise<ActionItem> {
    return request<ActionItem>(`/sessions/${sessionId}/actions/${actionId}`, {
      method: 'PATCH',
      body: JSON.stringify(item),
    });
  },

  async deleteActionItem(sessionId: string, actionId: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/sessions/${sessionId}/actions/${actionId}`, {
      method: 'DELETE',
    });
  },

  // Part B Uploads
  async uploadAudio(file: File, identifySpeakers: boolean, title?: string): Promise<{ sessionId: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('identifySpeakers', String(identifySpeakers));
    if (title) formData.append('title', title);

    return request<{ sessionId: string }>('/upload/audio', {
      method: 'POST',
      body: formData,
    });
  },

  async uploadTranscript(file: File, title?: string): Promise<{ sessionId: string }> {
    const formData = new FormData();
    formData.append('file', file);
    if (title) formData.append('title', title);

    return request<{ sessionId: string }>('/upload/transcript', {
      method: 'POST',
      body: formData,
    });
  },

  // Exports
  getExcelDownloadUrl(sessionId: string): string {
    return `${API_BASE}/sessions/${sessionId}/export/excel`;
  },

  async getNotionStatus(): Promise<{ connected: boolean; workspaceName?: string | null }> {
    return request<any>('/integrations/notion/status');
  },

  async getNotionPages(): Promise<{ pages: Array<{ id: string; title: string }> }> {
    return request<any>('/integrations/notion/pages');
  },

  async getNotionAuthUrl(): Promise<{ authUrl: string }> {
    return request<{ authUrl: string }>('/integrations/notion/auth');
  },

  async exportToNotion(sessionId: string, parentPageId: string): Promise<{ message: string; pageId: string }> {
    return request<any>(`/sessions/${sessionId}/export/notion`, {
      method: 'POST',
      body: JSON.stringify({ parentPageId }),
    });
  },
};
