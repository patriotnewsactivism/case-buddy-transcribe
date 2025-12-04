// @ts-nocheck
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

let tokenClient: any = null;

/**
 * Dynamically loads the Google API scripts (GAPI and GIS)
 * Ensures 'picker' library is strictly loaded into GAPI.
 */
export const loadGoogleScripts = () => {
  return new Promise<void>((resolve, reject) => {
    let pickerReady = false;
    let gisReady = false;

    const checkDone = () => {
        if (pickerReady && gisReady) resolve();
    };

    // --- 1. Load GAPI & Picker ---
    const onGapiLoaded = () => {
        if (!window.gapi) {
            reject(new Error("GAPI loaded but window.gapi is undefined"));
            return;
        }
        // Force load picker library every time
        window.gapi.load('picker', {
            callback: () => {
                pickerReady = true;
                checkDone();
            },
            onerror: () => reject(new Error("Failed to load Google Picker library (Network or CORS issue)"))
        });
    };

    if (window.gapi) {
        onGapiLoaded();
    } else {
        const script = document.createElement('script');
        script.src = 'https://apis.google.com/js/api.js';
        script.async = true;
        script.defer = true;
        script.onload = onGapiLoaded;
        script.onerror = () => reject(new Error("Failed to load Google API script (api.js)"));
        document.body.appendChild(script);
    }

    // --- 2. Load GIS (Identity Services) ---
    const onGisLoaded = () => {
         if (window.google && window.google.accounts) {
             gisReady = true;
             checkDone();
         } else {
             reject(new Error("GIS loaded but window.google.accounts is undefined"));
         }
    };

    if (window.google && window.google.accounts) {
        gisReady = true;
        checkDone();
    } else {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = onGisLoaded;
        script.onerror = () => reject(new Error("Failed to load Google Identity Services script"));
        document.body.appendChild(script);
    }
  });
};

/**
 * Initializes the Token Client (OAuth) ONLY. 
 */
const initTokenClient = (clientId: string) => {
    if (tokenClient) return; 

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
 * Recursively lists audio/video files
 */
const listFilesRecursive = async (folderId: string, accessToken: string, apiKey: string, onProgress?: (msg: string) => void): Promise<File[]> => {
    const filesFound: File[] = [];
    const query = `'${folderId}' in parents and (mimeType contains 'audio/' or mimeType contains 'video/' or mimeType = 'application/vnd.google-apps.folder') and trashed = false`;
    let pageToken = null;
    
    do {
        const params = new URLSearchParams({
            q: query,
            fields: 'nextPageToken, files(id, name, mimeType)',
            key: apiKey
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

                    // CRITICAL: Validate accessToken before using it
                    if (!accessToken || typeof accessToken !== 'string') {
                        console.error("OAuth response missing access_token:", resp);
                        reject(new Error("OAuth authentication failed: No access token received. Please try again."));
                        return;
                    }

                    try {
                        if (onProgress) onProgress("Opening Picker...");

                        // Extract App ID safely
                        let appId = '';
                        try {
                           appId = clientId.split('-')[0];
                        } catch(e) {
                           console.warn("Could not extract App ID from Client ID. Picker might fail if projects mismatch.");
                        }

                        // Validate origin components
                        const protocol = window.location.protocol;
                        const host = window.location.host;

                        if (!protocol || !host) {
                            throw new Error("Unable to determine application origin. Please reload the page.");
                        }

                        const origin = protocol + '//' + host;

                        // Check Picker Lib and all required constants
                        if (!window.google || !window.google.picker) {
                            throw new Error("Google Picker library not loaded.");
                        }

                        // Validate Google Picker API is fully initialized
                        const picker = window.google.picker;
                        if (!picker.PickerBuilder) {
                            throw new Error("Google Picker PickerBuilder not available.");
                        }
                        if (!picker.DocsView) {
                            throw new Error("Google Picker DocsView not available.");
                        }
                        if (!picker.ViewId || !picker.ViewId.DOCS_AUDIO || !picker.ViewId.DOCS_VIDEO) {
                            throw new Error("Google Picker ViewId constants not available.");
                        }
                        if (!picker.Response || !picker.Response.ACTION || !picker.Response.DOCUMENTS) {
                            throw new Error("Google Picker Response constants not available.");
                        }
                        if (!picker.Action || !picker.Action.PICKED || !picker.Action.CANCEL) {
                            throw new Error("Google Picker Action constants not available.");
                        }

                        // Validate all required values before building picker
                        if (!apiKey || typeof apiKey !== 'string') {
                            throw new Error("Invalid API Key. Please check Settings.");
                        }

                        // 5. BUILD PICKER
                        const pickerBuilder = new google.picker.PickerBuilder()
                            .setDeveloperKey(apiKey)
                            .setOAuthToken(accessToken)
                            .setOrigin(origin)
                            .addView(new google.picker.DocsView().setIncludeFolders(true).setSelectFolderEnabled(true))
                            .addView(google.picker.ViewId.DOCS_AUDIO)
                            .addView(google.picker.ViewId.DOCS_VIDEO);

                        // Only set AppId if we successfully extracted it
                        if (appId && typeof appId === 'string' && appId.length > 0) {
                            pickerBuilder.setAppId(appId);
                        }

                        pickerBuilder.setCallback(async (data: any) => {
                            try {
                                if (!data) {
                                    console.error("Picker callback received null/undefined data");
                                    return;
                                }

                                const action = data[google.picker.Response.ACTION];

                                if (action === google.picker.Action.PICKED) {
                                    const docs = data[google.picker.Response.DOCUMENTS];
                                    if (!docs || docs.length === 0) {
                                        resolve([]);
                                        return;
                                    }

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

                                } else if (action === google.picker.Action.CANCEL) {
                                    resolve([]);
                                }
                            } catch (callbackErr: any) {
                                console.error("Picker callback error:", callbackErr);
                                reject(new Error("Picker callback error: " + callbackErr.message));
                            }
                        });

                        // Separate build() call with detailed error handling
                        let builtPicker;
                        try {
                            console.log("Building picker with:", {
                                hasApiKey: !!apiKey,
                                hasAccessToken: !!accessToken,
                                origin: origin,
                                hasAppId: !!appId
                            });
                            builtPicker = pickerBuilder.build();
                        } catch (buildErr: any) {
                            console.error("Error during pickerBuilder.build():", buildErr);
                            throw new Error(`Picker build failed: ${buildErr.message || buildErr.toString()}`);
                        }

                        if (!builtPicker) {
                            throw new Error("Picker build returned null/undefined");
                        }

                        try {
                            builtPicker.setVisible(true);
                        } catch (showErr: any) {
                            console.error("Error showing picker:", showErr);
                            throw new Error(`Failed to show picker: ${showErr.message || showErr.toString()}`);
                        }

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