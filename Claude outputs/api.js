/**
 * API Service - Frontend bridge to PipeNexo backend
 * Handles all HTTP communication with Supabase/Express backend
 * Manages authentication tokens and request/response handling
 */

class ApiService {
  constructor(baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001/api') {
    this.baseUrl = baseUrl;
    this.accessToken = localStorage.getItem('accessToken');
    this.refreshToken = localStorage.getItem('refreshToken');
    this.companyId = localStorage.getItem('companyId');
    this.userId = localStorage.getItem('userId');
  }

  // ========== AUTHENTICATION ==========

  async login(email, password) {
    try {
      const response = await fetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Login failed');
      }

      const data = await response.json();
      this.setTokens(data.accessToken, data.refreshToken);
      this.companyId = data.companyId;
      this.userId = data.userId;

      localStorage.setItem('companyId', data.companyId);
      localStorage.setItem('userId', data.userId);
      localStorage.setItem('userEmail', data.email);

      return data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  async logout() {
    try {
      await this.request('POST', '/auth/logout');
      this.clearTokens();
      localStorage.removeItem('companyId');
      localStorage.removeItem('userId');
      localStorage.removeItem('userEmail');
    } catch (error) {
      console.error('Logout error:', error);
      this.clearTokens();
    }
  }

  async refreshAccessToken() {
    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.refreshToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      this.setTokens(data.accessToken, data.refreshToken);
      return data;
    } catch (error) {
      console.error('Token refresh error:', error);
      this.clearTokens();
      throw error;
    }
  }

  // ========== CORE HTTP METHOD ==========

  async request(method, endpoint, body = null) {
    const headers = {
      'Content-Type': 'application/json',
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const options = {
      method,
      headers,
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(body);
    }

    try {
      let response = await fetch(`${this.baseUrl}${endpoint}`, options);

      // Handle token expiration with automatic refresh
      if (response.status === 401 && this.refreshToken) {
        try {
          await this.refreshAccessToken();
          headers['Authorization'] = `Bearer ${this.accessToken}`;
          response = await fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            headers,
          });
        } catch (refreshError) {
          window.location.href = '/login.html';
          throw refreshError;
        }
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(error.message || `API error: ${response.status}`);
      }

      const text = await response.text();
      return text ? JSON.parse(text) : null;
    } catch (error) {
      console.error(`API request failed: ${method} ${endpoint}`, error);
      throw error;
    }
  }

  // ========== CLIENTS ==========

  async getClients(page = 1, limit = 20, search = '') {
    const query = new URLSearchParams({
      page,
      limit,
      ...(search && { search }),
    });
    return this.request('GET', `/clients?${query}`);
  }

  async getClient(id) {
    return this.request('GET', `/clients/${id}`);
  }

  async createClient(data) {
    return this.request('POST', '/clients', data);
  }

  async updateClient(id, data) {
    return this.request('PUT', `/clients/${id}`, data);
  }

  async deleteClient(id) {
    return this.request('DELETE', `/clients/${id}`);
  }

  // ========== DEALS ==========

  async getDeals(page = 1, limit = 20, filters = {}) {
    const query = new URLSearchParams({
      page,
      limit,
      ...filters,
    });
    return this.request('GET', `/deals?${query}`);
  }

  async getDeal(id) {
    return this.request('GET', `/deals/${id}`);
  }

  async createDeal(data) {
    return this.request('POST', '/deals', data);
  }

  async updateDeal(id, data) {
    return this.request('PUT', `/deals/${id}`, data);
  }

  async deleteDeal(id) {
    return this.request('DELETE', `/deals/${id}`);
  }

  // ========== POLICIES ==========

  async getPolicies(page = 1, limit = 20, search = '') {
    const query = new URLSearchParams({
      page,
      limit,
      ...(search && { search }),
    });
    return this.request('GET', `/policies?${query}`);
  }

  async getPolicy(id) {
    return this.request('GET', `/policies/${id}`);
  }

  async createPolicy(data) {
    return this.request('POST', '/policies', data);
  }

  async updatePolicy(id, data) {
    return this.request('PUT', `/policies/${id}`, data);
  }

  async deletePolicy(id) {
    return this.request('DELETE', `/policies/${id}`);
  }

  // ========== CLAIMS ==========

  async getClaims(page = 1, limit = 20, search = '') {
    const query = new URLSearchParams({
      page,
      limit,
      ...(search && { search }),
    });
    return this.request('GET', `/claims?${query}`);
  }

  async getClaim(id) {
    return this.request('GET', `/claims/${id}`);
  }

  async createClaim(data) {
    return this.request('POST', '/claims', data);
  }

  async updateClaim(id, data) {
    return this.request('PUT', `/claims/${id}`, data);
  }

  async deleteClaim(id) {
    return this.request('DELETE', `/claims/${id}`);
  }

  // ========== RENEWALS ==========

  async getRenewals(page = 1, limit = 20, search = '') {
    const query = new URLSearchParams({
      page,
      limit,
      ...(search && { search }),
    });
    return this.request('GET', `/renewals?${query}`);
  }

  async getRenewal(id) {
    return this.request('GET', `/renewals/${id}`);
  }

  async createRenewal(data) {
    return this.request('POST', '/renewals', data);
  }

  async updateRenewal(id, data) {
    return this.request('PUT', `/renewals/${id}`, data);
  }

  async deleteRenewal(id) {
    return this.request('DELETE', `/renewals/${id}`);
  }

  // ========== DASHBOARD ==========

  async getDashboardMetrics() {
    return this.request('GET', '/dashboard');
  }

  // ========== TOKEN MANAGEMENT ==========

  setTokens(accessToken, refreshToken) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }

  isAuthenticated() {
    return !!this.accessToken;
  }

  // ========== ERROR HANDLING ==========

  handleError(error) {
    console.error('API Error:', error);
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      this.clearTokens();
      window.location.href = '/login.html';
    }
    return error;
  }
}

// Export for browser
if (typeof window !== 'undefined') {
  window.ApiService = ApiService;
}
