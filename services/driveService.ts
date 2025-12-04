// @ts-nocheck
// We suppress TS checks here because gapi/google types are loaded dynamically

const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

let tokenClient: any = null;

/**
 * Dynamically loads the Google API scripts and ensures the Picker library is ready
 */
export const loadGoogleScripts = () => {
  return new Promise<void>((resolve, reject) => {
    // Helper to load GAPI libraries
    const loadGapiLibs = () => {
        if (!window.gapi) {
            reject(new Error("Google API Script failed to load."));
            return;
        }
        window.gapi.load('client:picker', () => {
            if (window.google) resolve();
        });
    };

    // 1. If scripts are already loaded and Picker is available, we are good.
    if (window.gapi && window.google && window.google.picker) {
        resolve();
        return;
    }

    // 2. If GAPI exists but not Picker, force load libs
    if (window.gapi && (!window.google || !window.google.picker)) {
        loadGapiLibs();
        return;
    }

    // 3. Load scripts from scratch
    const script1 = document.createElement('script');
    script1.src = 'https://apis.google.com/js/api.js';
    script1.async = true;
    script1.defer = true;
    script1.onload = loadGapiLibs;
    script1.onerror = () => reject(new Error("Failed to load gapi script"));
    document.body.appendChild(script1);

    const script2 = document.createElement('script');
    script2.src = 'https://accounts.google.com/gsi/client';
    script2.async = true;
    script2.defer = true;
    script2.onload = () => {
        // Just ensure google global is ready
    };
    script2.onerror = () => reject(new Error("Failed to load GIS script"));
    document.body.appendChild(script2);
  });
};

/**
 * Initializes the API client
 */
export const initGoogleClient = async (clientId: string, apiKey: string) => {
    if (!clientId) throw new Error("Google Client ID is required.");
    if (!apiKey) throw new Error("Google API Key is required.");
    
    // Safety check for gapi.client
    if (!gapi.client) {
        await new Promise<void>((resolve) => gapi.load('client', resolve));
    }

    try {
        await gapi.client.init({
            apiKey: apiKey,
            discoveryDocs: DISCOVERY_DOCS,
        });
    } catch (e: any) {
        throw new Error(`GAPI Init Failed: ${e?.result?.error?.message || e.message || 'Unknown error'}`);
    }

    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: '', // defined at request time
    });
};

/**
 * Downloads a file from Drive and converts it to a standard File object
 */
const downloadDriveFile = async (fileId: string, fileName: string, mimeType: string, accessToken: string): Promise<File> => {
    try {
        const fetchRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        
        if (!fetchRes.ok) throw new Error(`Download failed: ${fetchRes.statusText}`);

        const blob = await fetchRes.blob();
        return new File([blob], fileName, { type: mimeType });
    } catch (e) {
        console.error("Error downloading drive file", e);
        throw e;
    }
};

/**
 * Recursively lists audio/video files in a folder
 */
const listFilesRecursive = async (folderId: string, accessToken: string, onProgress?: (msg: string) => void): Promise<File[]> => {
    const filesFound: File[] = [];
    const query = `'${folderId}' in parents and (mimeType contains 'audio/' or mimeType contains 'video/' or mimeType = 'application/vnd.google-apps.folder') and trashed = false`;
    let pageToken = null;
    
    do {
        // We use fetch directly here to avoid gapi client library quirks with recursion
        const params = new URLSearchParams({
            q: query,
            fields: 'nextPageToken, files(id, name, mimeType)',
            key: gapi.client.apiKey // Use loaded API key
        });
        if (pageToken) params.append('pageToken', pageToken);

        const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!response.ok) throw new Error("Failed to list folder contents");
        
        const result = await response.json();
        const files = result.files;
        
        if (!files) break;

        for (const file of files) {
            if (file.mimeType === 'application/vnd.google-apps.folder') {
                if (onProgress) onProgress(`Scanning folder: ${file.name}...`);
                const children = await listFilesRecursive(file.id, accessToken, onProgress);
                filesFound.push(...children);
            } else {
                if (onProgress) onProgress(`Downloading: ${file.name}...`);
                const downloadedFile = await downloadDriveFile(file.id, file.name, file.mimeType, accessToken);
                filesFound.push(downloadedFile);
            }
        }
        pageToken = result.nextPageToken;
    } while (pageToken);

    return filesFound;
};

/**
 * Opens the Google Drive Picker
 */
export const openDrivePicker = (
    clientIdRaw: string, 
    apiKeyRaw: string, 
    onProgress?: (msg: string) => void
): Promise<File[]> => {
    return new Promise((resolve, reject) => {
        // 1. SANITIZE INPUTS
        const clientId = clientIdRaw?.trim();
        const apiKey = apiKeyRaw?.trim();

        if (!clientId || !apiKey) {
             reject(new Error("Missing credentials."));
             return;
        }

        // 2. LOAD SCRIPTS
        console.log("Loading Google Scripts...");
        if (onProgress) onProgress("Initializing Google API...");
        
        loadGoogleScripts().then(async () => {
            try {
                // 3. INIT CLIENT
                if (!tokenClient) {
                    await initGoogleClient(clientId, apiKey);
                }

                if (onProgress) onProgress("Waiting for login...");

                // 4. REQUEST TOKEN
                tokenClient.callback = async (resp: any) => {
                    if (resp.error !== undefined) {
                        console.error("OAuth Error:", resp);
                        reject(resp);
                        return;
                    }

                    // Sync token to gapi
                    if (gapi.client) {
                        gapi.client.setToken(resp);
                    }
                    const accessToken = resp.access_token;
                    
                    try {
                        if (onProgress) onProgress("Opening Picker...");
                        
                        // 5. EXTRACT APP ID
                        // Client ID format: 123456789-abcdefg.apps.googleusercontent.com
                        // The App ID is the "123456789" part.
                        const appIdParts = clientId.split('-');
                        if (appIdParts.length < 2) {
                            throw new Error("Invalid Client ID format. It should look like '123456-abcde.apps.googleusercontent.com'");
                        }
                        const appId = appIdParts[0]; 
                        
                        const origin = window.location.protocol + '//' + window.location.host;

                        // 6. BUILD PICKER
                        // We check for google.picker existence one last time
                        if (!window.google || !window.google.picker) {
                            throw new Error("Google Picker library failed to load. Please refresh the page.");
                        }

                        const pickerBuilder = new google.picker.PickerBuilder()
                            .setDeveloperKey(apiKey)
                            .setAppId(appId)
                            .setOAuthToken(accessToken)
                            .setOrigin(origin)
                            .addView(new google.picker.DocsView().setIncludeFolders(true).setSelectFolderEnabled(true))
                            .addView(google.picker.ViewId.DOCS_AUDIO)
                            .addView(google.picker.ViewId.DOCS_VIDEO);

                        pickerBuilder.setCallback(async (data: any) => {
                            if (data[google.picker.Response.ACTION] === google.picker.Action.PICKED) {
                                const docs = data[google.picker.Response.DOCUMENTS];
                                const results: File[] = [];
                                
                                try {
                                    let count = 0;
                                    for (const doc of docs) {
                                        count++;
                                        const progressMsg = `Downloading ${count}/${docs.length}: ${doc.name}`;
                                        if (onProgress) onProgress(progressMsg);

                                        if (doc.mimeType === 'application/vnd.google-apps.folder') {
                                            const children = await listFilesRecursive(doc.id, accessToken, onProgress);
                                            results.push(...children);
                                        } else {
                                            const file = await downloadDriveFile(doc.id, doc.name, doc.mimeType, accessToken);
                                            results.push(file);
                                        }
                                    }
                                    resolve(results);
                                } catch (downloadErr) {
                                    console.error("Download Error", downloadErr);
                                    reject(downloadErr);
                                }
                                
                            } else if (data[google.picker.Response.ACTION] === google.picker.Action.CANCEL) {
                                console.log("Picker cancelled by user.");
                                resolve([]);
                            }
                        });

                        const picker = pickerBuilder.build();
                        picker.setVisible(true);

                    } catch (buildError: any) {
                        console.error("Picker Build Error:", buildError);
                        let msg = "Failed to build Google Picker.";
                        if (buildError.message && buildError.message.includes("Feature not enabled")) {
                            msg += " Please verify 'Google Picker API' is enabled in your Cloud Project.";
                        } else {
                             msg += ` Details: ${buildError.message || JSON.stringify(buildError)}`;
                             msg += "\n\nTip: Ensure Client ID and API Key belong to the SAME Google Cloud Project.";
                        }
                        reject(new Error(msg));
                    }
                };

                // Trigger OAuth flow
                tokenClient.requestAccessToken({prompt: 'consent'});

            } catch (e) {
                console.error("Picker Initialization Error", e);
                reject(e);
            }
        });
    });
};