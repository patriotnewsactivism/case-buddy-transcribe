// @ts-nocheck
// We suppress TS checks here because gapi/google types are loaded dynamically

const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

let gapiInited = false;
let gisInited = false;
let tokenClient: any = null;

/**
 * Dynamically loads the Google API scripts
 */
export const loadGoogleScripts = () => {
  return new Promise<void>((resolve) => {
    if (window.gapi && window.google) {
        resolve();
        return;
    }

    const script1 = document.createElement('script');
    script1.src = 'https://apis.google.com/js/api.js';
    script1.async = true;
    script1.defer = true;
    script1.onload = () => {
        gapi.load('client:picker', async () => {
            gapiInited = true;
            if (gisInited) resolve();
        });
    };
    document.body.appendChild(script1);

    const script2 = document.createElement('script');
    script2.src = 'https://accounts.google.com/gsi/client';
    script2.async = true;
    script2.defer = true;
    script2.onload = () => {
        gisInited = true;
        if (gapiInited) resolve();
    };
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

    // Wrap initialization in a timeout to prevent infinite hanging
    const initPromise = gapi.client.init({
        apiKey: apiKey,
        discoveryDocs: DISCOVERY_DOCS,
    });

    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Google API Initialization timed out. Check your network or API Key restrictions.")), 15000)
    );

    await Promise.race([initPromise, timeoutPromise]);

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
    clientId: string, 
    apiKey: string, 
    onProgress?: (msg: string) => void
): Promise<File[]> => {
    return new Promise((resolve, reject) => {
        console.log("Loading Google Scripts...");
        if (onProgress) onProgress("Initializing Google API...");
        
        loadGoogleScripts().then(async () => {
            try {
                if (!tokenClient) {
                    await initGoogleClient(clientId, apiKey);
                }

                if (onProgress) onProgress("Waiting for login...");

                tokenClient.callback = async (resp: any) => {
                    if (resp.error !== undefined) {
                        console.error("OAuth Error:", resp);
                        reject(resp);
                        return;
                    }

                    // CRITICAL FIX: Manually sync the token to gapi client for library calls
                    if (gapi.client) {
                        gapi.client.setToken(resp);
                    }
                    const accessToken = resp.access_token;
                    
                    try {
                        if (onProgress) onProgress("Opening Picker...");
                        
                        // EXTRACT NUMERIC PROJECT ID
                        const appId = clientId.split('-')[0]; 
                        const origin = window.location.protocol + '//' + window.location.host;

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

                    } catch (buildError) {
                        console.error("Picker Build Error:", buildError);
                        reject(new Error("Failed to build Google Picker. Please ensure 'Google Picker API' is enabled in Cloud Console."));
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