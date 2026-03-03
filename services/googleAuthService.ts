import { jwtDecode } from "jwt-decode";

export interface GoogleUser {
  email: string;
  name: string;
  picture: string;
}

// Store the token client and user info in memory
let tokenClient: google.accounts.oauth2.TokenClient | null = null;
let googleUser: GoogleUser | null = null;
let accessToken: string | null = null;
let onUserChangeCallback: ((user: GoogleUser | null) => void) | null = null;

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

// Scopes required for the application
const SCOPES = [
  'https://www.googleapis.com/auth/drive.file', // For Google Drive uploads
  'https://www.googleapis.com/auth/generative-language.retriever', // For Gemini File API
].join(' ');

/**
 * Initializes the Google Identity Services client.
 * This should be called once when the application loads.
 */
export const initGoogleAuth = (onUserUpdate: (user: GoogleUser | null) => void) => {
  if (!GOOGLE_CLIENT_ID) {
    console.error("VITE_GOOGLE_CLIENT_ID is not set in the environment.");
    return;
  }

  onUserChangeCallback = onUserUpdate;

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPES,
    callback: async (tokenResponse) => {
      if (tokenResponse.error) {
        console.error("Google Auth Error:", tokenResponse.error_description);
        return;
      }
      
      accessToken = tokenResponse.access_token;

      // The ID token is not provided in the token response, so we need to
      // get it from the implicit flow (handled by the GIS library button)
      // For now, we'll just use the access token. We can't get user info from it directly.
      // This part will be updated when we integrate the sign-in button.
      console.log("Google Auth Success. Access Token retrieved.");

      // For now, we will assume the user info is retrieved separately
      // or we just notify that the user is authenticated.
      // The actual user object will be set via the sign-in button callback.
    },
  });
};

/**
 * Prompts the user to sign in and grant permissions.
 */
export const signIn = () => {
  if (!tokenClient) {
    console.error("Google Auth not initialized.");
    return;
  }
  // Prompt the user to select a Google Account and grant access
  tokenClient.requestAccessToken({ prompt: 'consent' });
};

/**
 * Handles the credential response from the Google Sign-In button.
 */
export const handleCredentialResponse = (response: google.accounts.id.CredentialResponse) => {
    try {
        const decoded: any = jwtDecode(response.credential);
        googleUser = {
            email: decoded.email,
            name: decoded.name,
            picture: decoded.picture,
        };
        if (onUserChangeCallback) {
            onUserChangeCallback(googleUser);
        }
        // After getting user info, get the access token
        signIn(); 
    } catch (e) {
        console.error("Failed to decode credential response:", e);
        googleUser = null;
        if (onUserChangeCallback) {
            onUserChangeCallback(null);
        }
    }
};

/**
 * Signs the user out.
 */
export const signOut = () => {
  if (googleUser) {
    google.accounts.id.revoke(googleUser.email, () => {
      googleUser = null;
      accessToken = null;
      if (onUserChangeCallback) {
        onUserChangeCallback(null);
      }
      console.log("User signed out.");
    });
  }
};

/**
 * Returns the current authenticated user.
 */
export const getUser = (): GoogleUser | null => {
  return googleUser;
};

/**
 * Returns the current access token.
 */
export const getAccessToken = (): string | null => {
  // TODO: Add logic to refresh the token if it's expired.
  return accessToken;
};
