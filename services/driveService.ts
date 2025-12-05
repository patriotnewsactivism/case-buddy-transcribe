// @ts-nocheck
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file';

let tokenClient: any = null;
let savedAccessToken: string | null = null;
let scriptsLoadedPromise: Promise<void> | null = null;

/**
 * Dynamically loads Google Scripts (GAPI & GIS) with a singleton promise
 * to prevent race conditions or multiple injections.
 */
export const loadGoogleScripts = (): Promise<void> => {
    if (scriptsLoadedPromise) return scriptsLoadedPromise;

    scriptsLoadedPromise = new Promise((resolve, reject) => {
        let pickerLoaded = false;
        let gisLoaded = false;

        const checkDone = () => {
            if (pickerLoaded && gisLoaded) resolve();
        };

        // 1. Load GAPI (for Picker)
        const loadGapi = () => {
            if (window.gapi) {
                window.gapi.load('picker', {
                    callback: () => {
                        pickerLoaded = true;
                        checkDone();
                    },
                    onerror: () => console.warn("Picker failed to load (might be blocked by adblocker)")
                });
            } else {
                const script = document.createElement('script');
                script.src = 'https://apis.google.com/js/api.js';
                script.async = true;
                script.defer = true;
                script.onload = () => {
                    if (window.gapi) {
                        window.gapi.load('picker', {
                            callback: () => {
                                pickerLoaded = true;
                                checkDone();
                            }
                        });
                    }
                };
                script.onerror = () => reject(new Error("Failed to load Google API script"));
                document.body.appendChild(script);
            }
        };

        // 2. Load GIS (for OAuth)
        const loadGis = () => {
            if (window.google && window.google.accounts) {
                gisLoaded = true;
                checkDone();
            } else {
                const script = document.createElement('script');
                script.src = 'https://accounts.google.com/gsi/client';
                script.async = true;
                script.defer = true;
                script.onload = () => {
                    gisLoaded = true;
                    checkDone();
                };
                script.onerror = () => reject(new Error("Failed to load Google Identity Services"));
                document.body.appendChild(script);
            }
        };

        loadGapi();
        loadGis();
    });

    return scriptsLoadedPromise;
};

/**
 * Initializes the Token Client (OAuth) logic
 */
const getAccessToken = async (clientId: string): Promise<string> => {
    await loadGoogleScripts();

    return new Promise((resolve, reject) => {
        // Return cached token if available (simple session cache)
        if (savedAccessToken) {
            resolve(savedAccessToken);
            return;
        }

        if (!window.google || !window.google.accounts) {
            reject(new Error("Google Identity Services not loaded."));
            return;
        }

        // Initialize client if needed
        if (!tokenClient) {
            try {
                tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: clientId,
                    scope: SCOPES,
                    callback: '', // Will be set in requestAccessToken
                });
            } catch (e) {
                reject(new Error("Failed to init token client. Check Client ID."));
                return;
            }
        }

        // Request token
        tokenClient.callback = (resp: any) => {
            if (resp.error) {
                console.error("OAuth Error:", resp);
                reject(new Error(`OAuth Error: ${resp.error}`));
            } else {
                savedAccessToken = resp.access_token;
                resolve(resp.access_token);
            }
        };

        // Trigger popup
        tokenClient.requestAccessToken({ prompt: 'consent' });
    });
};

/**
 * Uploads a file to Google Drive using standard REST API (no gapi.client)
 * This is much more robust against initialization errors.
 */
export const uploadToDrive = async (
    clientId: string,
    folderName: string,
    fileName: string, 
    content: Blob | string,
    mimeType: string
): Promise<string> => {
    try {
        const accessToken = await getAccessToken(clientId);

        // 1. Check for existing folder
        const folderQuery = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`;
        const folderRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        
        if (!folderRes.ok) throw new Error("Failed to search Drive folders.");
        const folderData = await folderRes.json();
        
        let folderId = '';
        if (folderData.files && folderData.files.length > 0) {
            folderId = folderData.files[0].id;
        } else {
            // Create folder
            const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: folderName,
                    mimeType: 'application/vnd.google-apps.folder'
                })
            });
            if (!createRes.ok) throw new Error("Failed to create folder.");
            const createData = await createRes.json();
            folderId = createData.id;
        }

        // 2. Upload File (Multipart)
        const metadata = {
            name: fileName,
            parents: [folderId]
        };

        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        
        const fileContent = typeof content === 'string' ? new Blob([content], { type: mimeType }) : content;
        formData.append('file', fileContent);

        const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: formData
        });

        if (!uploadRes.ok) {
            const err = await uploadRes.text();
            throw new Error(`Upload failed: ${err}`);
        }

        const result = await uploadRes.json();
        return result.id;

    } catch (e: any) {
        console.error("Drive Upload Error:", e);
        throw e;
    }
};

/**
 * Downloads a file content via fetch
 */
const downloadDriveFile = async (fileId: string, fileName: string, mimeType: string, accessToken: string): Promise<File> => {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error("Failed to download file content");
    const blob = await res.blob();
    return new File([blob], fileName, { type: mimeType });
};

/**
 * Helper to recursively list files in folders
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

        const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        
        if (!res.ok) break;
        const data = await res.json();
        const files = data.files || [];

        for (const file of files) {
            if (file.mimeType === 'application/vnd.google-apps.folder') {
                if (onProgress) onProgress(`Scanning ${file.name}...`);
                const children = await listFilesRecursive(file.id, accessToken, apiKey, onProgress);
                filesFound.push(...children);
            } else {
                if (onProgress) onProgress(`Downloading ${file.name}...`);
                filesFound.push(await downloadDriveFile(file.id, file.name, file.mimeType, accessToken));
            }
        }
        pageToken = data.nextPageToken;
    } while (pageToken);

    return filesFound;
};

/**
 * Opens the Google Drive Picker
 */
export const openDrivePicker = async (
    clientIdRaw: string, 
    apiKeyRaw: string, 
    onProgress?: (msg: string) => void
): Promise<File[]> => {
    const clientId = clientIdRaw?.trim();
    const apiKey = apiKeyRaw?.trim();

    if (!clientId || !apiKey) throw new Error("Missing Client ID or API Key");

    if (onProgress) onProgress("Initializing...");
    await loadGoogleScripts();

    const accessToken = await getAccessToken(clientId);

    return new Promise((resolve, reject) => {
        try {
            if (!window.google || !window.google.picker) {
                throw new Error("Picker API failed to load.");
            }

            const view = new google.picker.DocsView()
                .setIncludeFolders(true)
                .setSelectFolderEnabled(true);

            const pickerBuilder = new google.picker.PickerBuilder()
                .setDeveloperKey(apiKey)
                .setOAuthToken(accessToken)
                .addView(view)
                .addView(google.picker.ViewId.DOCS_AUDIO)
                .addView(google.picker.ViewId.DOCS_VIDEO)
                .setCallback(async (data: any) => {
                    if (data.action === google.picker.Action.PICKED) {
                        const docs = data.docs;
                        const results: File[] = [];
                        try {
                            for (let i = 0; i < docs.length; i++) {
                                const doc = docs[i];
                                if (onProgress) onProgress(`Processing ${i+1}/${docs.length}: ${doc.name}`);
                                
                                if (doc.mimeType === 'application/vnd.google-apps.folder') {
                                    const children = await listFilesRecursive(doc.id, accessToken, apiKey, onProgress);
                                    results.push(...children);
                                } else {
                                    results.push(await downloadDriveFile(doc.id, doc.name, doc.mimeType, accessToken));
                                }
                            }
                            resolve(results);
                        } catch (e: any) {
                            reject(new Error("Download failed: " + e.message));
                        }
                    } else if (data.action === google.picker.Action.CANCEL) {
                        resolve([]);
                    }
                });
            
            // Safe App ID extraction
            try {
                const appId = clientId.split('-')[0];
                if (appId) pickerBuilder.setAppId(appId);
            } catch (e) {
                // Ignore app ID if parsing fails
            }

            const picker = pickerBuilder.build();
            picker.setVisible(true);

        } catch (e: any) {
            reject(new Error("Failed to build picker: " + e.message));
        }
    });
};