import { jwtDecode } from "jwt-decode";

export interface GoogleUser {
  email: string;
  name: string;
  picture: string;
}

let tokenClient: google.accounts.oauth2.TokenClient | null = null;
let googleUser: GoogleUser | null = null;
let accessToken: string | null = null;
let onUserChangeCallback: ((user: GoogleUser | null) => void) | null = null;

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/generative-language.retriever',
].join(' ');

export const initGoogleAuth = (onUserUpdate: (user: GoogleUser | null) => void) => {
  if (!GOOGLE_CLIENT_ID) return;
  onUserChangeCallback = onUserUpdate;

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPES,
    callback: (tokenResponse) => {
      if (tokenResponse.error) return;
      accessToken = tokenResponse.access_token;
      console.log("Access Token acquired.");
    },
  });
};

export const handleCredentialResponse = (response: google.accounts.id.CredentialResponse) => {
    try {
        const decoded: any = jwtDecode(response.credential);
        googleUser = { email: decoded.email, name: decoded.name, picture: decoded.picture };
        if (onUserChangeCallback) onUserChangeCallback(googleUser);
        
        // After ID sign-in, request the access token for APIs
        if (tokenClient) tokenClient.requestAccessToken({ prompt: '' });
    } catch (e) {
        console.error("Auth Error", e);
    }
};

export const signIn = () => {
    if (tokenClient) tokenClient.requestAccessToken({ prompt: 'select_account' });
};

export const signOut = () => {
  googleUser = null;
  accessToken = null;
  if (onUserChangeCallback) onUserChangeCallback(null);
};

export const getAccessToken = () => accessToken;
export const getUser = () => googleUser;
