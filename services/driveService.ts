// @ts-nocheck
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

let tokenClient: any = null;

/**
 * Dynamically loads the Google API scripts (GAPI and GIS)
 */
export const loadGoogleScripts = () => {
  return new Promise<void>((resolve, reject) => {
    let gapiLoaded = false;
    let gisLoaded = false;

    const checkDone = () => {
        if (gapiLoaded && gisLoaded) resolve();
    };

    // 1. Load GAPI (for Picker)
    if (window.gapi) {
        gapiLoaded = true;
        checkDone();
    } else {
        const script1 = document.createElement('script');
        script1.src = 'https://apis.google.com/js/api.js';
        script1.async = true;
        script1.defer = true;
        script1.onload = () => {
            // Load the picker library specifically
            window.gapi.load('picker', () => {
                gapiLoaded = true;
                checkDone();
            });
        };
        script1.onerror = () => reject(new Error("Failed to load Google API script"));
        document.body.appendChild(script1);
    }

    // 2. Load GIS (for OAuth)
    if (window.google && window.google.accounts) {
        gisLoaded = true;
        checkDone();
    } else {
        const script2 = document.createElement('script');
        script2.src = 'https://accounts.google.com/gsi/client';
        script2.async = true;
        script2.defer = true;
        script2.onload = () => {
            gisLoaded = true;
            checkDone();
        };
        script2.onerror = () => reject(new Error("Failed to load Google Identity Services script"));
        document.body.appendChild(script2);
    }
  });
};

/**
 * Initializes the Token Client (OAuth) ONLY. 
 * Does NOT initialize the full gapi.client to avoid 'GAPI Init Failed' errors.
 */
const initTokenClient = (clientId: string) => {
    if (tokenClient) return; // Already inited

    if (!window.google || !window.google.accounts) {
        throw new Error("Google Identity Services not loaded.");
    }

    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: '', // defined dynamically at request time
    });
};

/**
 * Downloads a file from Drive using standard fetch
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
 * Recursively lists audio/video files using standard fetch
 * Note: explicitly takes apiKey since we aren't using gapi.client
 */
const listFilesRecursive = async (folderId: string, accessToken: string, apiKey: string, onProgress?: (msg: string) => void): Promise<File[]> => {
    const filesFound: File[] = [];
    const query = `'${folderId}' in parents and (mimeType contains 'audio/' or mimeType contains 'video/' or mimeType = 'application/vnd.google-apps.folder') and trashed = false`;
    let pageToken = null;
    
    do {
        const params = new URLSearchParams({
            q: query,
            fields: 'nextPageToken, files(id, name, mimeType)',
            key: apiKey // Pass the API key explicitly
        });
        if (pageToken) params.append('pageToken', pageToken);

        const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!response.ok) throw new Error("Failed to list folder contents. Check Drive API permission.");
        
        const result = await response.json();
        const files = result.files;
        
        if (!files) break;

        for (const file of files) {
            if (file.mimeType === 'application/vnd.google-apps.folder') {
                if (onProgress) onProgress(`Scanning folder: ${file.name}...`);
                const children = await listFilesRecursive(file.id, accessToken, apiKey, onProgress);
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
        // 1. SANITIZE
        const clientId = clientIdRaw?.trim();
        const apiKey = apiKeyRaw?.trim();

        if (!clientId || !apiKey) {
             reject(new Error("Missing credentials. Please check Settings."));
             return;
        }

        if (onProgress) onProgress("Initializing Google API...");
        
        // 2. LOAD
        loadGoogleScripts().then(() => {
            try {
                // 3. INIT OAUTH
                initTokenClient(clientId);

                if (onProgress) onProgress("Waiting for login...");

                // 4. REQUEST TOKEN
                tokenClient.callback = async (resp: any) => {
                    if (resp.error) {
                        console.error("OAuth Error:", resp);
                        reject(new Error(`OAuth Error: ${resp.error}`));
                        return;
                    }

                    const accessToken = resp.access_token;
                    
                    try {
                        if (onProgress) onProgress("Opening Picker...");
                        
                        // Extract App ID (Numeric part of Client ID)
                        const appId = clientId.split('-')[0]; 
                        const origin = window.location.protocol + '//' + window.location.host;

                        // Check Picker Lib
                        if (!window.google || !window.google.picker) {
                            throw new Error("Google Picker library not loaded.");
                        }

                        // 5. BUILD PICKER
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
                                            const children = await listFilesRecursive(doc.id, accessToken, apiKey, onProgress);
                                            results.push(...children);
                                        } else {
                                            const file = await downloadDriveFile(doc.id, doc.name, doc.mimeType, accessToken);
                                            results.push(file);
                                        }
                                    }
                                    resolve(results);
                                } catch (downloadErr: any) {
                                    console.error("Download Error", downloadErr);
                                    reject(new Error("Download failed: " + downloadErr.message));
                                }
                                
                            } else if (data[google.picker.Response.ACTION] === google.picker.Action.CANCEL) {
                                resolve([]);
                            }
                        });

                        const picker = pickerBuilder.build();
                        picker.setVisible(true);

                    } catch (buildError: any) {
                        console.error("Picker Build Error:", buildError);
                        let msg = buildError.message || "Failed to build Picker.";
                        if (msg.includes("Feature not enabled")) {
                             msg += " (Ensure 'Google Picker API' is enabled in Cloud Console)";
                        }
                        reject(new Error(msg));
                    }
                };

                // Trigger OAuth flow
                tokenClient.requestAccessToken({prompt: 'consent'});

            } catch (e: any) {
                console.error("Initialization Error", e);
                reject(new Error("Failed to initialize: " + e.message));
            }
        }).catch((err) => {
             reject(new Error("Script Load Error: " + err.message));
        });
    });
};