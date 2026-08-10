let accessToken = null;

export const tokenStore = {
  getAccessToken() {
    return accessToken;
  },

  setAccessToken(token) {
    accessToken = token;
  },

  clearAccessToken() {
    accessToken = null;
  }
};