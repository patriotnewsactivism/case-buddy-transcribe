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
const downloadDriveFile = async (fileId: string, fileName: string, mimeType: string): Promise<File> => {
    try {
        const token = gapi.client.getToken()?.access_token;
        if (!token) throw new Error("No active Google Access Token");

        const fetchRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { Authorization: `Bearer ${token}` }
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
const listFilesRecursive = async (folderId: string): Promise<File[]> => {
    const filesFound: File[] = [];
    const query = `'${folderId}' in parents and (mimeType contains 'audio/' or mimeType contains 'video/' or mimeType = 'application/vnd.google-apps.folder') and trashed = false`;
    let pageToken = null;
    
    do {
        if (!gapi.client.drive) await gapi.client.load('drive', 'v3');

        const response = await gapi.client.drive.files.list({
            q: query,
            fields: 'nextPageToken, files(id, name, mimeType)',
            pageToken: pageToken
        });
        
        const files = response.result.files;
        if (!files) break;

        for (const file of files) {
            if (file.mimeType === 'application/vnd.google-apps.folder') {
                const children = await listFilesRecursive(file.id);
                filesFound.push(...children);
            } else {
                const downloadedFile = await downloadDriveFile(file.id, file.name, file.mimeType);
                filesFound.push(downloadedFile);
            }
        }
        pageToken = response.result.nextPageToken;
    } while (pageToken);

    return filesFound;
};

/**
 * Opens the Google Drive Picker
 */
export const openDrivePicker = (clientId: string, apiKey: string): Promise<File[]> => {
    return new Promise((resolve, reject) => {
        console.log("Loading Google Scripts...");
        
        loadGoogleScripts().then(async () => {
            try {
                if (!tokenClient) {
                    console.log("Initializing GAPI...");
                    await initGoogleClient(clientId, apiKey);
                }

                console.log("Requesting OAuth Token...");
                tokenClient.callback = async (resp: any) => {
                    if (resp.error !== undefined) {
                        console.error("OAuth Error:", resp);
                        reject(resp);
                        return;
                    }
                    
                    try {
                        console.log("Building Picker...");
                        // EXTRACT NUMERIC PROJECT ID (Required for setAppId)
                        // Client ID format: 123456789-abcdefg.apps.googleusercontent.com
                        const appId = clientId.split('-')[0]; 
                        const origin = window.location.protocol + '//' + window.location.host;

                        const pickerBuilder = new google.picker.PickerBuilder()
                            .setDeveloperKey(apiKey)
                            .setAppId(appId)
                            .setOAuthToken(resp.access_token)
                            .setOrigin(origin) // Critical for avoiding CORS/Origin blocks
                            .addView(new google.picker.DocsView().setIncludeFolders(true).setSelectFolderEnabled(true))
                            .addView(google.picker.ViewId.DOCS_AUDIO)
                            .addView(google.picker.ViewId.DOCS_VIDEO);

                        pickerBuilder.setCallback(async (data: any) => {
                            if (data[google.picker.Response.ACTION] === google.picker.Action.PICKED) {
                                console.log("User picked files/folders. Downloading...");
                                const docs = data[google.picker.Response.DOCUMENTS];
                                const results: File[] = [];
                                
                                try {
                                    for (const doc of docs) {
                                        if (doc.mimeType === 'application/vnd.google-apps.folder') {
                                            const children = await listFilesRecursive(doc.id);
                                            results.push(...children);
                                        } else {
                                            const file = await downloadDriveFile(doc.id, doc.name, doc.mimeType);
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